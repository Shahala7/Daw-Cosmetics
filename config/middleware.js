const Product = require("../models/productSchema")

const checkProductAvailability = async (req, res) => {
    try {
        const productId = req.params.productId;
        const product = await Product.findById(productId);
        
        if (!product) {
            return res.status(404).json({
                available: false,
                message: "Product not found"
            });
        }

        return res.json({
            available: product.availability > 0,
            availability: product.availability
        });
    } catch (error) {
        console.error('Error checking availability:', error);
        return res.status(500).json({
            available: false,
            message: "Error checking availability"
        });
    }
};
module.exports = checkProductAvailability;