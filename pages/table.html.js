import fs from 'fs';
import path from 'path';

export async function getServerSideProps({ res }) {
  const htmlPath = path.join(process.cwd(), 'table.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.write(html);
  res.end();

  return { props: {} };
}

export default function TableHtmlRoute() {
  return null;
}