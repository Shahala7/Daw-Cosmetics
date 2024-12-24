const Mongoose = require("mongoose")

// Modify your MongoDB connection
const connectDB = Mongoose.connect('mongodb://localhost:27017/lakme1', {
  // Remove transaction-related configurations for local development
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Remove any transaction-related options
});

connectDB
    .then(()=>console.log("Database Connected"))
    .catch((err)=>console.log(err.message))
    







