
const User = require("../models/userSchema")
const Product = require("../models/productSchema")
const Cart = require('../models/cartSchema');
const mongodb = require("mongodb")
const mongoose = require('mongoose');
const getCartPage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        // Populate complete product details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                model: 'Product',
                select: 'productName productImage salePrice brand category'
            });

        console.log('Raw cart data:', JSON.stringify(cart, null, 2));

        if (!cart) {
            const emptyCart = {
                items: [],
                grandTotal: 0
            };
            return res.render('cart', { 
                cart: emptyCart, 
                grandTotal: 0, 
                user: req.session.user 
            });
        }

        // Filter out items with null productId and map remaining items
        cart.items = cart.items
            .filter(item => item.productId != null)
            .map(item => {
                // Create a base item object with existing data
                const baseItem = item.toObject();
                
                // Only add product-specific fields if they exist
                const productFields = item.productId ? {
                    productName: item.productId.productName,
                    productImage: item.productId.productImage,
                    brand: item.productId.brand,
                    category: item.productId.category,
                    salePrice: item.productId.salePrice
                } : {
                    productName: 'Product Not Available',
                    productImage: '/placeholder-image.jpg',
                    brand: 'N/A',
                    category: 'N/A',
                    salePrice: 0
                };

                return {
                    ...baseItem,
                    ...productFields
                };
            });

        // Recalculate grand total only for valid items
        const grandTotal = cart.items.reduce((total, item) => total + (item.totalPrice || 0), 0);
        
        req.session.grandTotal = grandTotal;

        // Add error view handling
        if (!res.render) {
            throw new Error('Response render function not found');
        }

        res.render('cart', { 
            cart, 
            grandTotal, 
            user: req.session.user 
        });

        console.log('Processed cart data:', JSON.stringify(cart, null, 2));

    } catch (error) {
        console.error('Get cart error:', error);
        
        // Check if error view exists
        try {
            res.status(500).render('error', { 
                message: "Failed to load cart",
                error: error.message
            });
        } catch (renderError) {
            // Fallback if error view doesn't exist
            res.status(500).json({ 
                message: "Failed to load cart",
                error: error.message
            });
        }
    }
};

// Update addToCart to store correct product data
const addToCart = async (req, res) => {
  try {
    console.log('hlooooo ');
    
      const userId = req.session.user;
      if (!userId) {
          return res.status(401).json({ status: false, message: "User not authenticated" });
      }
       
      const productId = req.body.productId;
      const quantity = parseInt(req.body.quantity) || 1;
       console.log(productId,'prrooid');
       
      const product = await Product.findById(productId);
      if (!product) {
          return res.status(404).json({ status: false, message: "Product not found" });
      }

      // Check stock availability
      if (product.quantity < 1) {
          return res.status(404).json({ status: false, message: "Product is out of stock" });
      }

      // Check if requested quantity is available
      if (quantity > product.quantity) {
          return res.status(400).json({ 
              status: false, 
              message: `Only ${product.quantity} items available in stock` 
          });
      }

      let cart = await Cart.findOne({ userId });

      if (!cart) {
          // Create new cart if it doesn't exist
          cart = new Cart({
              userId,
              items: [{
                  productName: product.productName,
                  productId: product._id,
                  productImage: product.productImage[0],  // Store first image
                  quantity,
                  price: product.salePrice,
                  totalPrice: product.salePrice * quantity,
                  brand: product.brand,
                  category: product.category
              }],
              grandTotal: product.salePrice * quantity
          });
      } else {
          // Update existing cart
          const existingItemIndex = cart.items.findIndex(
              item => item.productId.toString() === productId.toString()
          );

          if (existingItemIndex !== -1) {
              // Check if adding quantity exceeds available stock
              const newQuantity = cart.items[existingItemIndex].quantity + quantity;
              if (newQuantity > product.quantity) {
                  return res.status(400).json({ 
                      status: false, 
                      message: `Cannot add more items. Only ${product.quantity} items available in stock` 
                  });
              }

              cart.items[existingItemIndex].quantity = newQuantity;
              cart.items[existingItemIndex].totalPrice = 
                  product.salePrice * cart.items[existingItemIndex].quantity;
          } else {
              cart.items.push({
                  productName: product.productName,
                  productId: product._id,
                  productImage: product.productImage[0],  // Store first image
                  quantity,
                  price: product.salePrice,
                  totalPrice: product.salePrice * quantity,
                  brand: product.brand,
                  category: product.category
              });
          }

          // Recalculate grand total
          cart.grandTotal = cart.items.reduce((total, item) => total + item.totalPrice, 0);
      }

      console.log('Cart and items:', cart);

      await cart.save();
      return res.json({ 
          status: true, 
          message: "Product added to cart successfully",
          cart: cart // Optionally return cart data
      });

  } catch (error) {
      console.error('Add to cart error:', error);
      return res.status(500).json({ 
          status: false, 
          message: "Failed to add product to cart",
          error: error.message 
      });
  }
};

  // Change Quantity
const changeQuantity = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId, count } = req.body;

        // Validate user session
        if (!userId) {
            return res.status(401).json({
                status: false,
                error: "Please login to continue"
            });
        }

        // Validate product ID
        if (!productId || !mongoose.isValidObjectId(productId)) {
            return res.status(400).json({
                status: false,
                error: "Invalid product ID"
            });
        }

        // Validate count
        const countNum = parseInt(count);
        if (isNaN(countNum) || ![-1, 1].includes(countNum)) {
            return res.status(400).json({
                status: false,
                error: "Invalid quantity change value"
            });
        }

        // Find cart and product
        const cart = await Cart.findOne({ userId });
        const product = await Product.findById(productId);

        if (!cart || !product) {
            return res.status(404).json({
                status: false,
                error: "Cart or product not found"
            });
        }

        // Find item in cart
        const itemIndex = cart.items.findIndex(item => 
            item.productId.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                status: false,
                error: "Product not found in cart"
            });
        }

        // Calculate new quantity
        const newQuantity = cart.items[itemIndex].quantity + countNum;

        // Validate new quantity
        if (newQuantity <= 0) {
            cart.items.splice(itemIndex, 1);
        } else if (newQuantity > product.quantity) {
            return res.status(400).json({
                status: false,
                error: `Only ${product.quantity} units available in stock`
            });
        } else {
            cart.items[itemIndex].quantity = newQuantity;
            cart.items[itemIndex].totalPrice = product.salePrice * newQuantity;
        }

        // Update cart total
        cart.grandTotal = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        await cart.save();

        return res.json({
            status: true,
            quantityInput: newQuantity,
            price: product.salePrice,
            grandTotal: cart.grandTotal,
            message: "Cart updated successfully"
        });

    } catch (error) {
        console.error('Cart update error:', error);
        return res.status(500).json({
            status: false,
            error: "Failed to update cart"
        });
    }
};
  // Delete Product
const deleteProduct = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.productId;

        console.log('Delete request received:', { userId, productId });

        // Validate inputs
        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!productId) {
            return res.status(400).json({ error: "Product ID is required" });
        }

        // Find the cart
        const cart = await Cart.findOne({ userId });

        if (!cart) {
            return res.status(404).json({ error: "Cart not found" });
        }

        // Find the specific item
        const itemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId.toString()
        );

        if (itemIndex === -1) {
            return res.status(404).json({ error: "Item not found in cart" });
        }

        // Remove the item
        cart.items.splice(itemIndex, 1);

        // Recalculate grand total
        cart.grandTotal = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        if (cart.items.length === 0) {
            // If cart is empty, delete it
            await Cart.findOneAndDelete({ userId });
            console.log('Cart deleted as it became empty');
        } else {
            // Save updated cart
            await cart.save();
            console.log('Cart updated successfully');
        }

        res.status(200).json({
            success: true,
            message: "Item removed successfully",
            cartItemsCount: cart.items.length,
            newGrandTotal: cart.grandTotal
        });

    } catch (error) {
        console.error('Error in deleteProduct:', error);
        res.status(500).json({
            error: "Failed to delete item",
            details: error.message
        });
    }
};
module.exports = {
  
    getCartPage,
    addToCart,
    changeQuantity,
    deleteProduct,
}