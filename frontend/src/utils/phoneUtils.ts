export const normalizePakPhone = (phone: string): string => {
  const phoneFormatted = phone.replace(/[^0-9]/g, '');
  if (phoneFormatted.startsWith('0')) {
    return '92' + phoneFormatted.substring(1);
  }
  if (phoneFormatted.startsWith('92')) {
    return phoneFormatted;
  }
  // If it's something else, return as is (fallback)
  return phoneFormatted;
};
