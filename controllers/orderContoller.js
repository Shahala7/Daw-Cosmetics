const User = require("../models/userSchema")
const Product = require("../models/productSchema")
const Address = require("../models/addressSchema")
const Order = require("../models/orderSchema")
const Coupon = require("../models/couponSchema")
const invoice = require("../config/invoice")
const mongodb = require("mongodb")
const razorpay = require("razorpay")
const crypto = require("crypto");
const Cart=require('../models/cartSchema')
const mongoose=require("mongoose")

let instance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})

const getCheckoutPage = async (req, res) => {
  try {
      const userId = req.session.user;
      const cartData = await Cart.findOne({ userId }).populate('items.productId');
      
      if (!cartData || !cartData.items.length) {
          return res.render("checkout", { 
              error: "No items in cart",
              cartItems: [],
              grandTotal: 0,
              user: null,
              userAddress: null,
              coupons: []
          });
      }

      // Process cart items to handle null productId
      const processedItems = cartData.items.map(item => {
          const baseItem = item.toObject();
          
          // If productId is null, provide default values
          if (!item.productId) {
              return {
                  ...baseItem,
                  productId: {
                      productImage: ['default-product-image.jpg'],
                      productName: 'Product No Longer Available',
                      price: 0
                  },
                  productName: 'Product No Longer Available',
                  isAvailable: false
              };
          }
          
          return {
              ...baseItem,
              isAvailable: true
          };
      });

      const user = await User.findById(userId);
      const addressData = await Address.findOne({ userId });
      
      // Find valid coupons
      const coupons = await Coupon.find({
        isList: true,
        createdOn: { $lt: new Date() },
        expireOn: { $gt: new Date() },
        minimumPrice: { $lt: cartData.grandTotal }
    }).lean(); // `lean` ensures lightweight plain JavaScript objects instead of Mongoose documents.
    
    // Ensure it's explicitly treated as an array.
    const couponArray = Array.isArray(coupons) ? coupons : [];
    

      // Recalculate grand total only for available products
      const grandTotal = processedItems
          .filter(item => item.isAvailable)
          .reduce((total, item) => total + (item.totalPrice || 0), 0);

      res.render("checkout", {
          cartItems: processedItems,
          user,
          userAddress: addressData,
          isSingle: false,
          grandTotal,
          coupons,
          error: null
      });
  } catch (error) {
      console.error("Error in getCheckoutPage:", error);
      res.status(500).render("error", { 
          message: "Failed to load checkout page",
          error: error.message 
      });
  }
};
  
const orderPlaced = async (req, res) => {
  try {
    const { totalPrice, addressId, payment, productId, isSingle, retryOrderId } = req.body;
      const userId = req.session.user;
      const findUser = await User.findOne({ _id: userId });
      const couponDiscount = req.session.coupon || 0;
      req.session.payment = payment;
      let order;
      
      
      if (!findUser) {
          return res.status(404).json({ error: "User not found" });
      }

      
      const grandTotal = totalPrice;

      // Find address
      const addressDocument = await Address.findOne({ 
          userId: userId, 
          'address._id': addressId 
      });

      if (!addressDocument) {
          return res.status(404).json({ error: "Address not found" });
      }

      const findAddress = addressDocument.address.find(
          item => item._id.toString() === addressId
      );

      // Handle single product order
      if (isSingle === "true") {
          const findProduct = await Product.findOne({ _id: productId });
          if (!findProduct) {
              return res.status(404).json({ error: "Product not found" });
          }

          const productDetails = {
            _id: findProduct._id,
            price: findProduct.salePrice,
            name: findProduct.productName,
            image: findProduct.productImage[0],
            brand: findProduct.brand,
            category: findProduct.category,
            productOffer: findProduct.regularPrice - findProduct.salePrice,
            quantity: 1
          };

          const newOrder = new Order({
              product: productDetails,
              totalPrice: grandTotal,
              address: findAddress,
              payment: payment,
              userId: userId,
              couponDiscount,
              createdOn: Date.now(),
              status: "Payment Pending",
          });

          // Reduce product quantity
          findProduct.quantity = Math.max(findProduct.quantity - 1, 0);
          await findProduct.save();
          // Payment processing
          return await processPayment(
              res, 
              newOrder, 
              findUser, 
              findProduct, 
              payment, 
              grandTotal, 
              1
          );
      } 
      
      // Handle cart order
      else {
          // Find cart items for the user
          const cartDocument = await Cart.findOne({ userId: userId });

          if (!cartDocument || !cartDocument.items || cartDocument.items.length === 0) {
              return res.status(404).json({ error: "Cart is empty" });
          }

          // Prepare product IDs from cart items
          const productIds = cartDocument.items.map(item => item.productId);
          
          // Find all products in the cart
          const findProducts = await Product.find({ _id: { $in: productIds } });

          // Map cart items to ordered products
          const orderedProducts = cartDocument.items.map(cartItem => {
              const product = findProducts.find(p => p._id.toString() === cartItem.productId.toString());
              
              return {
                  _id: product._id,
                  price: product.salePrice,
                  name: product.productName,
                  image: product.productImage[0],
                  quantity: cartItem.quantity
              };
          });

          const newOrder = new Order({
              product: orderedProducts,
              totalPrice: grandTotal,
              address: findAddress,
              payment: payment,
              userId: userId,
              status: "Payment Pending",
              createdOn: Date.now()
          });
          req.session.newOrder=newOrder;

          

          // Reduce product quantities
          for (let orderedProduct of orderedProducts) {
              const product = await Product.findOne({ _id: orderedProduct._id });
              if (product) {
                  product.quantity = Math.max(product.quantity - orderedProduct.quantity, 0);
                  await product.save();
              }
          }

          // Payment processing
          return await processPayment(
              res, 
              newOrder, 
              userId,
              findUser, 
              findProducts, 
              payment, 
              grandTotal, 
              cartDocument.items.length
          );
      }
  } catch (error) {
      console.error("Order Placement Error:", error);
      res.status(500).json({ 
          error: "Failed to place order", 
          message: error.message 
      });
  }
};
// Extracted payment processing logic
const processPayment = async (
  res, 
  newOrder, 
  userId,
  findUser, 
  products, 
  paymentMethod, 
  totalPrice, 
  quantity,

) => {
  let orderDone;

  switch (paymentMethod) {
      case 'cod':
          console.log('Order placed with Cash on Delivery (COD)');
          orderDone = await newOrder.save();
          await Order.findOneAndUpdate({_id:orderDone._id},{status: "Confirmed"})
          await Cart.deleteOne({ userId: userId });
          return res.json({ 
              payment: true, 
              method: "cod", 
              order: orderDone, 
              quantity: quantity, 
              orderId: findUser._id 
          });

      case 'online':
         
          const generatedOrder = await generateOrderRazorpay(newOrder.userId, newOrder.totalPrice);
          if(generatedOrder && generatedOrder.id){
            console.log("Razorpay Order Generated Successfully:", generatedOrder);

            orderDone = await newOrder.save();
            await Order.findOneAndUpdate({_id:orderDone._id},{status: "Confirmed"})
             await Cart.deleteOne({ userId: userId });
          }else{
            console.error("Generated Order is Invalid:", generatedOrder);
          }

          console.log(generatedOrder,"gggdorder");
          
          return res.json({ 
              payment: false, 
              method: "online", 
              razorpayOrder: generatedOrder, 
              order: orderDone, 
              orderId: orderDone._id, 
              quantity: quantity 
          });

      case 'wallet':
          if (totalPrice <= findUser.wallet) {
              // console.log("Order placed with Wallet");
              findUser.wallet -= totalPrice;
              
              const newHistory = {
                  amount: findUser.wallet,
                  status: "debit",
                  date: Date.now()
              };
              
              findUser.history.push(newHistory);
              await findUser.save();
              
              orderDone = await newOrder.save();
                await Order.findOneAndUpdate({_id:orderDone._id},{status: "Confirmed"})
                await Cart.deleteOne({ userId: userId });
              return res.json({ 
                  payment: true, 
                  method: "wallet", 
                  order: orderDone, 
                  orderId: orderDone._id, 
                  quantity: quantity, 
                  success: true 
              });
          } else {
              console.log("Insufficient wallet balance");
              return res.json({ 
                  payment: false, 
                  method: "wallet", 
                  success: false 
              });
          }

      default:
          return res.status(400).json({ error: "Invalid payment method" });
  }
};
// Existing Razorpay order generation function remains the same
const generateOrderRazorpay = (orderId, total) => {
  return new Promise((resolve, reject) => {
      const options = {
          amount: total * 100,
          currency: "INR",
          receipt: String(orderId)
      };
      
      instance.orders.create(options, function (err, order) {
          if (err) {
              console.error("Razorpay Order Generation Failed:", err);
              reject(err);
          } else {
              console.log("Razorpay Order Generated:", JSON.stringify(order));
              resolve(order);
          }
      });
  });
};
const verify = (req, res) => {
  console.log(req.body,"end");
  let hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(
      `${req.body.payment.razorpay_order_id}|${req.body.payment.razorpay_payment_id}`
  );
  hmac = hmac.digest("hex");
  // console.log(hmac,"HMAC");
  // console.log(req.body.payment.razorpay_signature,"signature");
  if (hmac === req.body.payment.razorpay_signature) {
      console.log("true");
      res.json({ status: true });
  } else {
      console.log("false");
      res.json({ status: false });
  }
};


const savePendingOrder = async (req, res) => {

  try {
    let newOrder=req.session.newOrder
     if(newOrder.status === "Payment Pending"){
        await Order.findOneAndUpdate({_id : newOrder._id},{status : "Pending"})
     }
      res.status(200).send({ status: 'Pending order saved' });
  } catch (error) {
      console.error('Error saving pending order:', error);
      res.status(500).send({ status: 'error', error: error.message });
  }
};

const getOrderDetailsPage = async (req, res) => {
  try {
      const userId = req.session.user
      const orderId = req.query.id
      const findOrder = await Order.findOne({ _id: orderId }).populate("product._id")
      const findUser = await User.findOne({ _id: userId })
      
      let productId = findOrder.product.flatMap((item)=>{
        return item
      })
      console.log(productId,"prodct344");
      console.log(findOrder.product,"fndordr")
      
      res.render("orderDetails", { orders: findOrder, user: findUser, orderId ,productId:productId})
  } catch (error) {
      console.log(error.message);
  }
}


const getOrderListPageAdmin = async (req, res) => {
  try {
      const orders = await Order.find({}).sort({ createdOn: -1 });

      let itemsPerPage = 5
      let currentPage = parseInt(req.query.page) || 1
      let startIndex = (currentPage - 1) * itemsPerPage
      let endIndex = startIndex + itemsPerPage
      let totalPages = Math.ceil(orders.length / 3)
      const currentOrder = orders.slice(startIndex, endIndex)

      res.render("orders-list", { orders: currentOrder, totalPages, currentPage })
  } catch (error) {
      console.log(error.message);
  }
}

const cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, itemId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    // Find the specific item to cancel
    const itemToCancel = order.product.find(item => item._id.toString() === itemId);

    if (!itemToCancel) {
      return res.status(404).json({ 
        success: false, 
        message: "Item not found in order" 
      });
    }

    // Update order status for this item
    itemToCancel.status = "Cancelled";

    // Refund calculation based on order status and item
    const refundAmount = calculateRefundAmount(order, itemToCancel);

    // Restore product stock
    await Product.findByIdAndUpdate(
      itemToCancel._id, 
      { $inc: { quantity: itemToCancel.quantity } },
      { session }
    );

    // Update user wallet or payment method
    if (refundAmount > 0) {
      await processRefund(order.userId, refundAmount, order.payment);
    }

    await order.save({ session });
    await session.commitTransaction();

    return res.json({ 
      success: true, 
      message: "Item cancelled successfully",
      refundAmount 
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ 
      success: false, 
      message: "Failed to cancel item" 
    });
  } finally {
    session.endSession();
  }
};
const cancelOrder = async (req, res) => {
    try {
        console.log("im here");
        const userId = req.session.user
        const findUser = await User.findOne({ _id: userId })

        if (!findUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const orderId = req.query.orderId
        // console.log(orderId);

        await Order.updateOne({ _id: orderId },
            { status: "Canceled" }
        ).then((data) => console.log(data))

        const findOrder = await Order.findOne({ _id: orderId })

        if (findOrder.payment === "wallet" || findOrder.payment === "online") {
            findUser.wallet += findOrder.totalPrice;

            
            const newHistory = {
                orderId:findOrder._id,
                amount: findOrder.totalPrice,
                status: "credit",
                date: Date.now()
            }
            
            findUser.history.push(newHistory)
            await findUser.save();
        }

        // console.log(findOrder);

        for (const productData of findOrder.product) {
            const productId = productData.ProductId;
            const quantity = productData.quantity;

            const product = await Product.findById(productId);

            console.log(product, "=>>>>>>>>>");

            if (product) {
                product.quantity += quantity;
                await product.save();
            }
        }

        res.redirect('/profile');

    } catch (error) {
        console.log(error.message);
    }
}


const returnOrder = async (req, res) => {
  try {

      const userId = req.session.user
      const findUser = await User.findOne({ _id: userId })

      if (!findUser) {
          return res.status(404).json({ message: 'User not found' });
      }

      const id = req.query.id
      await Order.updateOne({ _id: id },
          { status: "Returned" }
      ).then((data) => console.log(data))

      const findOrder = await Order.findOne({ _id: id })


      if (findOrder.payment === "wallet" || findOrder.payment === "online") {
          findUser.wallet += findOrder.totalPrice;

          const newHistory = {
              amount: findOrder.totalPrice,
              status: "credit",
              date: Date.now()
          }
          findUser.history.push(newHistory)
          await findUser.save();
      }

      for (const productData of findOrder.product) {
          const productId = productData.ProductId;
          const quantity = productData.quantity;

          const product = await Product.findById(productId);

          // console.log(product,"=>>>>>>>>>");

          if (product) {
              product.quantity += quantity;
              await product.save();
          }
      }
      console.log(Product,"prodduct");
      res.redirect ('/orderDetails');

  } catch (error) {
      console.log(error.message);
  }
}


// Handle the return request submission
const processReturnRequest = async (req, res) => {
  try {
      const { orderId, userId, products, reason } = req.body;

      // Update order status
      await Order.updateOne(
          { _id: orderId },
          { status: "Returned" }
      );

      const findOrder = await Order.findOne({ _id: orderId });
      const findUser = await User.findOne({ _id: userId });

      // Process refund if payment was made through wallet or online
      if (findOrder.payment === "wallet" || findOrder.payment === "online") {
          findUser.wallet += findOrder.totalPrice;
          
          const newHistory = {
              amount: findOrder.totalPrice,
              status: "credit",
              date: Date.now()
          };
          findUser.history.push(newHistory);
          await findUser.save();
      }

      // Update product quantities
      for (const productData of products) {
          const product = await Product.findById(productData.productId);
          if (product) {
              product.quantity += parseInt(productData.quantity);
              await product.save();
          }
      }

      res.json({ success: true, message: 'Return processed successfully' });

  } catch (error) {
      console.log(error.message);
      res.status(500).json({ success: false, message: 'Error processing return' });
  }
}


const changeOrderStatus = async (req, res) => {
    try {

        const orderId = req.query.orderId
        

        await Order.updateOne({ _id: orderId },
            { status: req.query.status }
        ).then((data) => console.log(data))


        res.redirect('/admin/orderList');

    } catch (error) {
        console.log(error.message);
    }
}

const getOrderDetailsPageAdmin = async (req, res) => {
    try {
        const orderId = req.query.id
    
const findOrder = await Order.findOne({ _id: orderId }).populate("product._id")


        res.render("order-details-admin", { orders: findOrder, orderId })
    } catch (error) {
        console.log(error.message);
    }
}

const getInvoice = async (req, res) => {
    try {
        await invoice.invoice(req, res);
    } catch (error) {
        console.log(error.message);
    }
}
const getCartCheckoutPage = async (req, res) => {
  try {
      res.render("checkoutCart")
  } catch (error) {
      console.log(error.message);
  }
}
const retryPayment = async (req, res) => {
    try {
        const userId = req.session.user
        const { orderId } = req.body;
        const user = await User.findById(userId);
        const order = await Order.findById(orderId)      
        
        
        if (!order || !user) {
            
            return res.status(404).json({ status: 'error', message: 'Order or User not found' });
        }
       
      // Prepare Razorpay order
        const razorpayOrder = await instance.orders.create({
            amount: order.totalPrice * 100,
            currency: "INR",
            receipt: `order_rcptid_${orderId}`
        });
        order.status = 'Confirmed';

        // Save the updated order back to the database
        const updatedOrder = await order.save();
    
        res.json({
            method: 'online',
            razorpayOrder,
            totalPrice: updatedOrder.totalPrice,
            customerName: user.name,
            customerEmail: user.email,
            customerContact: user.phone,
            productId: updatedOrder.product._id,
            addressId: updatedOrder.address._id
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
    };

module.exports = {
   getCartCheckoutPage,
    getCheckoutPage,
    orderPlaced,
    changeOrderStatus,
    getOrderDetailsPage,
    getOrderListPageAdmin,
    cancelOrder,
    cancelOrderItem,
    returnOrder,
    getOrderDetailsPageAdmin,
    getInvoice,
    processReturnRequest ,
    verify,
    savePendingOrder,
    retryPayment
        
}