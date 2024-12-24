const express = require("express");
const app = express();
const passport = require("passport");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const nocache = require("nocache");
const dotenv = require("dotenv");
dotenv.config();
const flash = require('connect-flash');

const PORT = process.env.PORT || 5000;

require("./DB/dataBase");
require("./config/passport");

// Middleware Setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended:true}));
app.use(nocache());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 72 * 60 * 60 * 1000, // 72 hours
        httpOnly: true
    }
}));

// Use connect-flash
app.use(flash());

// Make flash messages accessible in views
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});
app.use(passport.initialize());
app.use(passport.session());

// View Engine Setup
app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin")]);

// Static Files Setup
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static('uploads'));

// Routes Setup
const userRoutes = require("./routes/userRouter");
const adminRoutes = require("./routes/adminRouter");


app.use("/", userRoutes);
app.use("/admin", adminRoutes);

// Handle 404 Errors
app.get('*', function (req, res) {
    res.redirect("/pageNotFound");
});

// Start Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
