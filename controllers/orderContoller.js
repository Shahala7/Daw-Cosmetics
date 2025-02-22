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
        // Add request logging
        console.log('Cancel order request received:', {
            method: req.method,
            orderId: req.body.orderId,
            userId: req.session.user
        });

        const userId = req.session.user;
        if (!userId) {
            console.log('User session not found');
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const findUser = await User.findOne({ _id: userId });
        if (!findUser) {
            console.log('User not found in database:', userId);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const orderId = req.body.orderId;
        if (!orderId) {
            console.log('Order ID missing in request');
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Validate orderId format
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.log('Invalid order ID format:', orderId);
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID format'
            });
        }

        const findOrder = await Order.findOne({ _id: orderId }).lean();
        if (!findOrder) {
            console.log('Order not found:', orderId);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order is already canceled
        if (findOrder.status === "Canceled") {
            console.log('Order already canceled:', orderId);
            return res.status(400).json({
                success: false,
                message: 'Order is already canceled'
            });
        }

        // Start a session for transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Update order status
            const updateResult = await Order.updateOne(
                { 
                    _id: orderId,
                    status: { $ne: "Canceled" } // Prevent double cancellation
                },
                { status: "Canceled" },
                { session }
            );

            if (updateResult.matchedCount === 0) {
                throw new Error('Order not found or already canceled');
            }

            // Process refund if applicable
            if (findOrder.payment === "wallet" || findOrder.payment === "online") {
                const walletUpdate = await User.updateOne(
                    { _id: userId },
                    {
                        $inc: { wallet: findOrder.totalPrice },
                        $push: {
                            history: {
                                orderId: findOrder._id,
                                amount: findOrder.totalPrice,
                                status: "credit",
                                date: new Date()
                            }
                        }
                    },
                    { session }
                );

                if (walletUpdate.matchedCount === 0) {
                    throw new Error('Failed to update user wallet');
                }
            }

            // Restore product quantities
            for (const productData of findOrder.product) {
                const updateResult = await Product.updateOne(
                    { _id: productData._id },
                    { $inc: { quantity: productData.quantity } },
                    { session }
                );

                if (updateResult.matchedCount === 0) {
                    throw new Error(`Product not found: ${productData._id}`);
                }
            }

            // Commit the transaction
            await session.commitTransaction();

            console.log('Order successfully canceled:', orderId);
            return res.status(200).json({
                success: true,
                message: 'Order cancelled successfully'
            });

        } catch (error) {
            // If anything fails, abort the transaction
            await session.abortTransaction();
            throw error; // Re-throw to be caught by outer catch block
        } finally {
            // End the session
            session.endSession();
        }

    } catch (error) {
        console.error('Cancel order error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
            error: error.message
        });
    }
};
const returnOrder = async (req, res) => {
    try {
        const orderId = req.query.id;
        
        // Fetch order details with populated product information
        const order = await Order.findById(orderId)
            .populate('product._id') // Assuming this is how your product reference is structured
            .lean(); // For better performance
        
        if (!order) {
            return res.status(404).render('error', {
                message: 'Order not found',
                user: req.session.user
            });
        }

        // Check if order is eligible for return
        const orderDate = new Date(order.orderDate);
        const currentDate = new Date();
        const daysDifference = Math.floor((currentDate - orderDate) / (1000 * 60 * 60 * 24));

        if (daysDifference > 7) { // 7 days return policy
            return res.status(400).render('error', {
                message: 'Return period has expired',
                user: req.session.user
            });
        }

        // Render return form
        res.render('returnRequestForm', {
            order: order,
            user: req.session.user
        });

    } catch (error) {
        console.error('Return Order Error:', error);
        res.status(500).render('error', {
            message: 'Something went wrong',
            user: req.session.user
        });
    }
};

const processReturnRequest = async (req, res) => {
    try {
       const userId = req.session.user;
        const { orderId, products, reason, comments } = req.body;
console.log(req.body,"req.body");

        // Enhanced input validation
        if (!orderId || !userId || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Parse products if it's a string (coming from hidden input)
        let parsedProducts;
        try {
            parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid products data format'
            });
        }

        // Find and validate order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify order belongs to user
        if (order.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to order'
            });
        }

        // Validate return eligibility
        const orderDate = new Date(order.orderDate);
        const currentDate = new Date();
        const daysDifference = Math.floor((currentDate - orderDate) / (1000 * 60 * 60 * 24));

        if (daysDifference > 7) {
            return res.status(400).json({
                success: false,
                message: 'Return period has expired'
            });
        }

        // Update order status with transaction
        const session = await mongoose.startSession();
        await session.startTransaction();

        try {
            // Update order
            order.status = "Returned";
            order.returnReason = reason;
            order.returnComments = comments;
            order.returnRequestDate = new Date();
            await order.save({ session });

            // Process refund if applicable
            const user = await User.findById(userId).session(session);
            if (!user) {
                throw new Error('User not found');
            }

            if (order.payment === "wallet" || order.payment === "online") {
                user.wallet += order.totalPrice;
                user.history.push({
                    amount: order.totalPrice,
                    type: "credit",
                    description: `Refund for order ${orderId}`,
                    date: new Date()
                });
                await user.save({ session });
            }

            // Update inventory
            for (const item of parsedProducts) {
                if (!item._id) continue;
                
                const product = await Product.findById(
                    typeof item._id === 'object' ? item._id._id : item._id
                ).session(session);
                
                if (product) {
                    product.quantity += Number(item.quantity) || 1;
                    await product.save({ session });
                }
            }

            await session.commitTransaction();
            
            res.json({
                success: true,
                message: 'Return request processed successfully',
                redirectUrl: '/profile'
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('Process Return Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing return',
            error: error.message
        });
    }
};

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