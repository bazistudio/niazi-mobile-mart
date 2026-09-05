const pdf = require("pdf-parse");

const parsePDFBuffer = async (buffer) => {
  try {
    const data = await pdf(buffer);

    return {
      text: data.text,
      pages: data.numpages,
    };
  } catch (error) {
    throw new Error("PDF parsing failed: " + error.message);
  }
};

module.exports = {
  parsePDFBuffer,
};
