const Mongoose = require('mongoose');
const Category = require('./categorySchema');
const subcategorySchema = Mongoose.Schema({
    subcategoryName: {
        type: String,
        required: true,
        unique: true
    },
    isListed: {
        type: Boolean,
        default: true
    },
    CategoryId:{
     type:Mongoose.Schema.Types.ObjectId,
     ref:'Category'
    }
});
const Subcategory = Mongoose.model('Subcategory', subcategorySchema) ;
module.exports = Subcategory;

