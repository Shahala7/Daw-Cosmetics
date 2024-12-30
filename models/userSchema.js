const { default: mongoose } = require("mongoose");
const Mongoose = require("mongoose");
const userSchema = Mongoose.Schema({
    googleId:{
        type:Number
    },
        name: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'blocked'],
            default: 'active'
        },
        email: {
            type: String,
            required: true,
            unique: false
        },
        phone: {
            type: String,
            unique: true,  // Ensures that the mobile number is unique
            // validate: {
            //   validator: function(v) {
            //     return /\d{10}/.test(v);  // Example for validating a 10-digit mobile number
            //   },
            //   message: props => `${props.value} is not a valid mobile number!`
            // }
          },
        password: {
            type: String,
    
        },
        createdOn: {
            type: String
        },
        isBlocked: {
            type: Boolean,
            default: false
        },
        isAdmin: {
            type: String,
            default: "0"
        },
       
        wishlist: {
            type: Array
        },
        wallet: {
            type: Number,
            default: 0
        },
        history: {
            type: Array
        },
        referalCode: {
            type: String,
            
        },
        redeemed: {
            type: Boolean,
            default: false,
        },
        redeemedUsers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "user",
                required: true,
            }
        ],
    });
    
    
    const User = Mongoose.model("User", userSchema);
    
    module.exports = User;