import subprocess, os, pypdf, pymupdf
d = os.path.dirname(os.path.abspath(__file__))
pdf = os.path.join(d, "Albedo_LunarLightClock.pdf")
subprocess.run([r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--headless=new", "--disable-gpu",
                "--no-pdf-header-footer", f"--print-to-pdf={pdf}", "file:///" + os.path.join(d, "deck.html").replace("\\", "/")],
               check=True, capture_output=True, timeout=120)
print(len(pypdf.PdfReader(pdf).pages), os.path.getsize(pdf))
for i, p in enumerate(pymupdf.open(pdf)):
    p.get_pixmap(dpi=80).save(os.path.join(d, f"p{i+1}.png"))
