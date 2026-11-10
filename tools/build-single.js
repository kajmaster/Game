// Bundles the game into one self-contained HTML fragment (styles, font and script inlined).
// Handy for sharing a playable preview or embedding the game in another page.
// Usage: node tools/build-single.js [output.html]
const fs = require('fs'), path = require('path');
const www = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
const body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0];
const font = fs.readFileSync(path.join(www, 'fonts/unbounded.woff2')).toString('base64');
const css = fs.readFileSync(path.join(www, 'style.css'), 'utf8').replace('url("fonts/unbounded.woff2")', `url("data:font/woff2;base64,${font}")`);
const js = fs.readFileSync(path.join(www, 'game.js'), 'utf8');
const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'loopstar.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<title>Loopstar</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`);
console.log('wrote', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
