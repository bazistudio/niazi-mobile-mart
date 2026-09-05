import { printFormatter } from '@/features/settings/printer/utils/printFormatter';

export const downloadHtmlAsPdf = async (html: string, filename: string) => {
  const element = document.createElement('div');
  element.innerHTML = html;
  
  const opt = {
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
  };

  const html2pdf = (await import('html2pdf.js')).default;
  html2pdf().set(opt).from(element).save();
};
