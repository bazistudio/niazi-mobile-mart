const multer = require("multer");
const path = require("path");

// store files temporarily in memory (clean for PDF parsing)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ["application/pdf"];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only PDF files are allowed"), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = upload;
