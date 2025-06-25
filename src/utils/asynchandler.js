//this is a try catch method to handle async await .
const asynchandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: true,
      message: error.message,
    });
  }
};

export { asynchandler };
