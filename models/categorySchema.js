
const Mongoose = require("mongoose")
const categorySchema =  Mongoose.Schema({
    name : {
        type : String,
        required : true,
        unique : true
    },
    description : {
        type : String,
        required : true
    },
    isListed : {
        type : Boolean,
        default : true
    },
    subcategories: [{
        type: Mongoose.Schema.Types.ObjectId,
        ref: 'Subcategory'
    }],
    categoryOffer : {
        type : Number,
        default : 0
    }
})

const Category = Mongoose.model("Category", categorySchema)

module.exports = Category

