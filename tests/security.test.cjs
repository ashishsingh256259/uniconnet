const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const script = scripts.find(s => s.includes('function escapeHTML'));
assert.ok(script, 'application script exists');
const helper = script.match(/function escapeHTML\(value\) \{[\s\S]*?\n\}/);
assert.ok(helper);
const escapeHTML = vm.runInNewContext(helper[0] + '\nescapeHTML');
test('all inline scripts parse', () => scripts.forEach(s => new vm.Script(s)));
test('escapes HTML metacharacters', () => {
  assert.equal(escapeHTML('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
});
test('neutralizes markup and event handler payloads', () => {
  assert.equal(escapeHTML('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHTML('"><svg onload=alert(1)>'), '&quot;&gt;&lt;svg onload=alert(1)&gt;');
});
test('preserves plain text and handles empty values', () => {
  assert.equal(escapeHTML('Hello, student! नमस्ते'), 'Hello, student! नमस्ते');
  assert.equal(escapeHTML(null), '');
  assert.equal(escapeHTML(undefined), '');
  assert.equal(escapeHTML(0), '0');
});
test('untrusted render fields use the encoder', () => {
  for (const field of ['d.q','d.subject','r.text','n.title','n.text','p.q','opt','m.text','text','reply']) {
    assert.ok(script.includes('escapeHTML(' + field + ')'), field);
    assert.ok(!script.includes('$' + '{' + field + '}'), 'raw interpolation: ' + field);
  }
});
test('resource name is data rather than inline executable code', () => {
  assert.ok(html.includes('data-resource-name="' + '$' + '{escapeHTML(r.name)}"'));
  assert.ok(html.includes('this.dataset.resourceName'));
});
