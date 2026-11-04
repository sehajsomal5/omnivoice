import fs from 'fs';
import { execSync } from 'child_process';

const md = fs.readFileSync('DOCUMENTATION.md', 'utf8');

function renderMarkdown(content) {
  const lines = content.split('\n');
  let html = '';
  let inCode = false;
  let codeBuffer = '';
  let inTable = false;
  let tableBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCode) {
        html += `<pre><code>${codeBuffer.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>\n`;
        codeBuffer = '';
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer += line + '\n';
      continue;
    }

    // Tables
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableBuffer = [];
      }
      // Skip separator
      if (line.includes('---')) continue;
      tableBuffer.push(line);
      continue;
    } else if (inTable) {
      // Flush table
      html += '<table>\n';
      tableBuffer.forEach((tLine, idx) => {
        const cells = tLine.split('|').map(c => c.trim()).filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length);
        const tag = idx === 0 ? 'th' : 'td';
        html += '  <tr>' + cells.map(c => `<${tag}>${formatInline(c)}</${tag}>`).join('') + '</tr>\n';
      });
      html += '</table>\n';
      inTable = false;
    }

    // Headers
    if (line.startsWith('# ')) {
      html += `<h1>${formatInline(line.slice(2))}</h1>\n`;
    } else if (line.startsWith('## ')) {
      html += `<h2>${formatInline(line.slice(3))}</h2>\n`;
    } else if (line.startsWith('### ')) {
      html += `<h3>${formatInline(line.slice(4))}</h3>\n`;
    } else if (line.startsWith('> ')) {
      html += `<blockquote>${formatInline(line.slice(2))}</blockquote>\n`;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      html += `<li>${formatInline(line.slice(2))}</li>\n`;
    } else if (line.trim().length === 0) {
      // Empty line
    } else {
      html += `<p>${formatInline(line)}</p>\n`;
    }
  }

  return html;
}

function formatInline(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const styledHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OmniVoice AI — Official Documentation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
    @page {
      margin: 18mm 16mm;
      size: A4 portrait;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0f172a;
      line-height: 1.55;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 20pt;
      color: #3b0764;
      border-bottom: 2.5px solid #8b5cf6;
      padding-bottom: 6px;
      margin-top: 14pt;
      margin-bottom: 10pt;
      font-weight: 800;
    }
    h2 {
      font-size: 14pt;
      color: #4c1d95;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 16pt;
      margin-bottom: 8pt;
      font-weight: 700;
      page-break-after: avoid;
    }
    h3 {
      font-size: 11.5pt;
      color: #6b21a8;
      margin-top: 12pt;
      margin-bottom: 4pt;
      font-weight: 700;
      page-break-after: avoid;
    }
    blockquote {
      background: #f5f3ff;
      border-left: 4px solid #8b5cf6;
      margin: 10pt 0;
      padding: 6pt 12pt;
      color: #4c1d95;
      font-size: 9.5pt;
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #ede9fe;
      font-weight: 700;
      color: #3b0764;
    }
    tr:nth-child(even) {
      background-color: #faf5ff;
    }
    code {
      font-family: 'JetBrains Mono', Consolas, monospace;
      background: #f1f5f9;
      color: #7c3aed;
      padding: 1.5pt 4pt;
      border-radius: 3px;
      font-size: 8.5pt;
    }
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 10pt 12pt;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 8.5pt;
      margin: 8pt 0;
      page-break-inside: avoid;
    }
    pre code {
      background: transparent;
      color: #e2e8f0;
      padding: 0;
    }
    li {
      margin-bottom: 3pt;
    }
    p {
      margin: 5pt 0;
    }
    a {
      color: #7c3aed;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  ${renderMarkdown(md)}
</body>
</html>`;

fs.writeFileSync('documentation.html', styledHtml);
console.log('✅ Generated documentation.html');

// Generate PDF via Microsoft Edge Headless print-to-pdf
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const htmlPath = 'file:///' + process.cwd().replace(/\\/g, '/') + '/documentation.html';
const pdfPath = process.cwd() + '\\OmniVoice_Documentation.pdf';

const cmd = `"${edgePath}" --headless --no-sandbox --disable-gpu --print-to-pdf="${pdfPath}" "${htmlPath}"`;
console.log('Running PDF conversion...');
execSync(cmd);

if (fs.existsSync('OmniVoice_Documentation.pdf')) {
  const stats = fs.statSync('OmniVoice_Documentation.pdf');
  console.log(`🎉 SUCCESS: OmniVoice_Documentation.pdf generated (${(stats.size / 1024).toFixed(1)} KB)`);
} else {
  console.error('Failed to generate PDF');
}
