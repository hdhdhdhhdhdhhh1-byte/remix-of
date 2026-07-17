import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function exportElementAsImage(el: HTMLElement, filename: string) {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename + ".png";
  a.click();
}

export async function exportElementAsPDF(el: HTMLElement, filename: string) {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 10;
  pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - 20;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 10;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;
  }
  pdf.save(filename + ".pdf");
}

export function printElement(el: HTMLElement) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
    <title>طباعة</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap"/>
    <style>
      body { font-family: 'Cairo', Tahoma, sans-serif; padding: 16px; direction: rtl; }
      table { width:100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
      th { background: #f3f4f6; }
      h1, h2, h3 { margin: 8px 0; }
    </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 500);
}

export async function shareElementAsImage(el: HTMLElement, filename: string, title: string) {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return;
  const file = new File([blob], filename + ".png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename + ".png"; a.click();
    URL.revokeObjectURL(url);
  }
}
