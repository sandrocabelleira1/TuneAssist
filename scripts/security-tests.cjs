const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(__dirname + '/../src/app/api/verify-payment/route.ts', 'utf8');
function fixture(payment, authenticated = true) {
  const documents = new Map();
  const db = {
    doc: path => path,
    runTransaction: async callback => callback({
      get: async path => ({ exists: documents.has(path), data: () => documents.get(path) }),
      set: (path, data) => documents.set(path, {...documents.get(path), ...data}),
      create: (path, data) => { assert.equal(documents.has(path), false); documents.set(path, data); },
    }),
  };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({body, status: options?.status ?? 200}) } },
    'mercadopago': { MercadoPagoConfig: class {}, Payment: class { async get() { return payment; } } },
    '@/lib/firebase/admin': { adminDb: db, authenticatedUser: async () => { if (!authenticated) throw Error('UNAUTHORIZED'); return {uid:'owner',email:'owner@example.test'}; } },
    '@/lib/payment-products': { paymentProducts: { credits: {price:198}, renewal:{price:149}, license:{price:149} } },
    'date-fns': { addMonths: (date, months) => { const next = new Date(date); next.setMonth(next.getMonth()+months); return next; } },
  };
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',code)(name => { assert.ok(name in dependencies, name); return dependencies[name]; },module,module.exports);
  return { post: module.exports.POST, documents };
}
const valid = () => ({id:123,status:'approved',live_mode:true,currency_id:'BRL',transaction_amount:198,transaction_amount_refunded:0,external_reference:'owner',metadata:{user_id:'owner',type:'credits'}});
const request = () => ({json:async()=>({paymentId:'123'})});
process.env.MERCADO_PAGO_ACCESS_TOKEN = 'test-only-placeholder';
test('unauthenticated calls are rejected', async () => {
  const f=fixture(valid(),false); assert.equal((await f.post(request())).status,401); assert.equal(f.documents.size,0);
});
test('foreign, pending, underpaid and refunded payments grant nothing', async () => {
  for (const changes of [{external_reference:'other'},{metadata:{user_id:'other',type:'credits'}},{status:'pending'},{live_mode:false},{transaction_amount:1},{currency_id:'USD'},{transaction_amount_refunded:1},{metadata:{user_id:'owner',type:'toString'}}]) {
    const f=fixture({...valid(),...changes}); assert.equal((await f.post(request())).status,409); assert.equal(f.documents.size,0);
  }
});
test('replaying a verified payment does not duplicate credits', async () => {
  const f=fixture(valid()); assert.equal((await f.post(request())).status,200); assert.equal((await f.post(request())).status,200);
  assert.equal(f.documents.get('users/owner').credits,10); assert.equal(f.documents.size,2);
});

