const normalizeText = (text = "") => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

module.exports = { normalizeText };
