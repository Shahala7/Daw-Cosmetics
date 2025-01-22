const express = require("express")
const Router = express.Router()
const passport=require('passport')
require('../config/passport')
const userController = require("../controllers/userController")
const mongoose = require('mongoose');
const Product = require('../models/productSchema');
const userProfileController=require('../controllers/ProfileController')
const address=require("../models/addressSchema")
const { isLogged } = require("../Authentication/auth")
const cart=require("../models/cartSchema")
const cartController = require("../controllers/cartController")
const orderController = require("../controllers/orderContoller")
const checkProductAvailability =require("../config/middleware")
const walletController = require("../controllers/walletController")
const wishlistController = require("../controllers/wishlistController")


Router.get("/pageNotFound", userController.pageNotFound)

// User actions
Router.get("/", userController.getHomePage)
Router.get("/login", userController.getLoginPage)
Router.post("/login", userController.userLogin)
Router.get("/signup", userController.getSignupPage)
Router.post("/verify-otp", userController.verifyOtp)
Router.post("/resend-Otp",userController.resendOtp )
Router.post("/signup", userController.signupUser)
Router.get("/logout", isLogged, userController.getLogoutUser)
Router.get("/forgotPassword", userProfileController.getForgotPassPage)
Router.post("/forgotEmailValid", userProfileController.forgotEmailValid)
Router.post("/verifyPassOtp", userProfileController.verifyForgotPassOtp)
Router.get("/resetPassword", userProfileController.getResetPassPage)
Router.post("/changePassword", userProfileController.postNewPassword)

Router.get("/auth/google", passport.authenticate('google', { scope: ['profile', 'email'] }));

Router.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/failure" }),
    (req, res) => {
        req.session.user = req.user._id;  // Use req.user._id to reference the user ID
        res.redirect("/");
    }
);

Router.get("/profile", isLogged, userProfileController.getUserProfile)
Router.get("/addAddress", isLogged, userProfileController.getAddressAddPage)
Router.post("/addAddress", isLogged, userProfileController.postAddress)
Router.get("/editAddress", isLogged, userProfileController.getEditAddress),
Router.post("/updateAddress", isLogged, userProfileController.postEditAddress)
Router.get("/deleteAddress", isLogged, userProfileController.getDeleteAddress)
Router.post("/editUserDetails", isLogged, userProfileController.editUserDetails)
Router.post("/resetPassword", isLogged, userProfileController.resetPassword)
Router.post("/profile/verifyReferalCode", isLogged, userProfileController.verifyReferalCode)
Router.get("/productDetails",isLogged, userController.getProductDetailsPage)
Router.get("/shop", isLogged,userController.getShopPage)
Router.get("/search",isLogged, userController.searchProducts)
Router.get("/filter",isLogged, userController.filterProduct)
Router.get("/filterPrice",isLogged, userController.filterByPrice)
Router.post("/api/products/sort",isLogged, userController.getSortProducts)

// Cart

Router.get("/cart", isLogged, cartController.getCartPage);
Router.post("/addToCart", isLogged, cartController.addToCart);
Router.put('/api/cart/quantity',isLogged ,cartController.changeQuantity);
Router.delete('/api/cart/items/:productId', isLogged, cartController.deleteProduct);


//Orders
Router.get("/checkout",isLogged, orderController.getCheckoutPage)
Router.post("/orderPlaced", isLogged, orderController.orderPlaced)
Router.get("/orderDetails", isLogged, orderController.getOrderDetailsPage)
Router.get("/cancelOrder", isLogged, orderController.cancelOrder)
Router.post("/cancelOrder", isLogged, orderController.cancelOrder)
Router.get('/return', isLogged, orderController.returnOrder);
Router.post('/processReturn', isLogged, orderController.processReturnRequest);
Router.post("/verifyPayment", isLogged, orderController.verify)
Router.get("/invoice", orderController.getInvoice)
Router.post("/applyCoupon", isLogged, userController.applyCoupon)
Router.post("/savePendingOrder", isLogged, orderController.savePendingOrder)
Router.post("/retryPayment", isLogged, orderController.retryPayment);

// Wallet
Router.post("/addMoney", isLogged, walletController.addMoneyToWallet)
Router.post("/verify-payment", isLogged, walletController.verify_payment)


// Wishlist
Router.get("/wishlist", isLogged, wishlistController.getWishlistPage)
Router.post('/api/wishlist/add',isLogged, wishlistController.addToWishlist)
Router.get("/deleteWishlist", isLogged, wishlistController.deleteItemWishlist)


module.exports = Router;
