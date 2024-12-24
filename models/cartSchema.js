const Mongoose = require('mongoose');

const cartSchema = new Mongoose.Schema({
    userId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    items: [{
        productName: {
            type: String,
            required: true
        },
        productId: {
            type: Mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        productImage: {
            type: String
        },
        quantity: {
            type: Number,
            default: 1,
            min: 1
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        totalPrice: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    grandTotal: {
        type: Number,
        required: true,
        min: 0
    },
}, {
    timestamps: true
});

module.exports = Mongoose.model('Cart', cartSchema);
