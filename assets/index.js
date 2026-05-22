(function () {
  const r = document.createElement("link").relList;
  if (r && r.supports && r.supports("modulepreload")) return;
  for (const u of document.querySelectorAll('link[rel="modulepreload"]')) e(u);
  new MutationObserver((u) => {
    for (const l of u)
      if (l.type === "childList")
        for (const i of l.addedNodes)
          i.tagrid-templName === "LINK" && i.rel === "modulepreload" && e(i);
  }).observe(document, { childList: !0, subtree: !0 });
  function t(u) {
    const l = {};
    return (
      u.integrity && (l.integrity = u.integrity),
      u.referrerPolicy && (l.referrerPolicy = u.referrerPolicy),
      u.crossOrigin === "use-credentials"
        ? (l.credentials = "include")
        : u.crossOrigin === "anonymous"
          ? (l.credentials = "omit")
          : (l.credentials = "same-origin"),
      l
    );
  }
  function e(u) {
    if (u.ep) return;
    u.ep = !0;
    const l = t(u);
    fetch(u.href, l);
  }
})();
const Cr = "5";
typeof window < "u" &&
  (window.__svelte || (window.__svelte = { v: new Set() })).v.add(Cr);
const Ar = 1,
  Nr = 2,
  Sr = 16,
  Or = 2,
  Mr = !1;
var Yn = Array.isArray,
  yn = Array.from,
  Dr = Object.defineProperty,
  Rn = Object.getOwnPropertyDescriptor,
  Fr = Object.getOwnPropertyDescriptors,
  Ln = Object.getPrototypeOf;
const U = () => {},
  S = 2,
  zn = 4,
  fn = 8,
  xn = 16,
  A = 32,
  an = 64,
  gn = 128,
  K = 256,
  ln = 512,
  m = 1024,
  R = 2048,
  Q = 4096,
  k = 8192,
  j = 16384,
  qr = 32768,
  Tn = 65536,
  Ir = 1 << 19,
  Rr = 1 << 20,
  Lr = Symbol("");
function $r(n) {
  return n === this.v;
}
function Wn(n, r) {
  return n != n
    ? r == r
    : n !== r || (n !== null && typeof n == "object") || typeof n == "function";
}
function Pr(n) {
  return !Wn(n, this.v);
}
function Br(n) {
  throw new Error("effect_in_teardown");
}
function Hr() {
  throw new Error("effect_in_unowned_derived");
}
function Vr(n) {
  throw new Error("effect_orphan");
}
function Ur() {
  throw new Error("effect_update_depth_exceeded");
}
function Yr() {
  throw new Error("state_unsafe_local_read");
}
function zr() {
  throw new Error("state_unsafe_mutation");
}
let Wr = !1;
function un(n) {
  return { f: 0, v: n, reactions: null, equals: $r, version: 0 };
}
function Kr(n) {
  return jr(un(n));
}
function Kn(n, r = !1) {
  const t = un(n);
  return (r || (t.equals = Pr), t);
}
function jr(n) {
  return (p !== null && p.f & S && (C === null ? et([n]) : C.push(n)), n);
}
function jn(n, r) {
  return (
    p !== null &&
      ut() &&
      p.f & (S | xn) &&
      (C === null || !C.includes(n)) &&
      zr(),
    Gn(n, r)
  );
}
function Gn(n, r) {
  return (
    n.equals(r) ||
      ((n.v = r),
      (n.version = sr()),
      Xn(n, R),
      d !== null &&
        d.f & m &&
        !(d.f & A) &&
        (w !== null && w.includes(n)
          ? (N(d, R), vn(d))
          : D === null
            ? lt([n])
            : D.push(n))),
    r
  );
}
function Xn(n, r) {
  var t = n.reactions;
  if (t !== null)
    for (var e = t.length, u = 0; u < e; u++) {
      var l = t[u],
        i = l.f;
      i & R || (N(l, r), i & (m | K) && (i & S ? Xn(l, Q) : vn(l)));
    }
}
function Jn(n) {
  var r = n.children;
  if (r !== null) {
    n.children = null;
    for (var t = 0; t < r.length; t += 1) {
      var e = r[t];
      e.f & S ? kn(e) : L(e);
    }
  }
}
function Gr(n) {
  for (var r = n.parent; r !== null; ) {
    if (!(r.f & S)) return r;
    r = r.parent;
  }
  return null;
}
function Qn(n) {
  var r,
    t = d;
  W(Gr(n));
  try {
    (Jn(n), (r = fr(n)));
  } finally {
    W(t);
  }
  return r;
}
function Zn(n) {
  var r = Qn(n),
    t = (V || n.f & K) && n.deps !== null ? Q : m;
  (N(n, t), n.equals(r) || ((n.v = r), (n.version = sr())));
}
function kn(n) {
  (Jn(n),
    J(n, 0),
    N(n, j),
    (n.v = n.children = n.deps = n.ctx = n.reactions = null));
}
function Xr(n) {
  (d === null && p === null && Vr(), p !== null && p.f & K && Hr(), Sn && Br());
}
function Jr(n, r) {
  var t = r.last;
  t === null
    ? (r.last = r.first = n)
    : ((t.next = n), (n.prev = t), (r.last = n));
}
function Z(n, r, t, e = !0) {
  var u = (n & an) !== 0,
    l = d,
    i = {
      ctx: b,
      deps: null,
      deriveds: null,
      nodes_start: null,
      nodes_end: null,
      f: n | R,
      first: null,
      fn: r,
      last: null,
      next: null,
      parent: u ? null : l,
      prev: null,
      teardown: null,
      transitions: null,
      version: 0,
    };
  if (t) {
    var s = Y;
    try {
      ($n(!0), cn(i), (i.f |= qr));
    } catch (o) {
      throw (L(i), o);
    } finally {
      $n(s);
    }
  } else r !== null && vn(i);
  var a =
    t &&
    i.deps === null &&
    i.first === null &&
    i.nodes_start === null &&
    i.teardown === null &&
    (i.f & Rr) === 0;
  if (!a && !u && e && (l !== null && Jr(i, l), p !== null && p.f & S)) {
    var f = p;
    (f.children ?? (f.children = [])).push(i);
  }
  return i;
}
function Qr(n) {
  const r = Z(fn, null, !1);
  return (N(r, m), (r.teardown = n), r);
}
function Zr(n) {
  Xr();
  var r = d !== null && (d.f & A) !== 0 && b !== null && !b.m;
  if (r) {
    var t = b;
    (t.e ?? (t.e = [])).push({ fn: n, effect: d, reaction: p });
  } else {
    var e = nr(n);
    return e;
  }
}
function nt(n) {
  const r = Z(an, n, !0);
  return () => {
    L(r);
  };
}
function nr(n) {
  return Z(zn, n, !1);
}
function Cn(n) {
  return An(n);
}
function An(n, r = 0) {
  return Z(fn | xn | r, n, !0);
}
function X(n, r = !0) {
  return Z(fn | A, n, !0, r);
}
function rr(n) {
  var r = n.teardown;
  if (r !== null) {
    const t = Sn,
      e = p;
    (Pn(!0), z(null));
    try {
      r.call(null);
    } finally {
      (Pn(t), z(e));
    }
  }
}
function tr(n) {
  var r = n.deriveds;
  if (r !== null) {
    n.deriveds = null;
    for (var t = 0; t < r.length; t += 1) kn(r[t]);
  }
}
function er(n, r = !1) {
  var t = n.first;
  for (n.first = n.last = null; t !== null; ) {
    var e = t.next;
    (L(t, r), (t = e));
  }
}
function rt(n) {
  for (var r = n.first; r !== null; ) {
    var t = r.next;
    (r.f & A || L(r), (r = t));
  }
}
function L(n, r = !0) {
  var t = !1;
  if ((r || n.f & Ir) && n.nodes_start !== null) {
    for (var e = n.nodes_start, u = n.nodes_end; e !== null; ) {
      var l = e === u ? null : Fn(e);
      (e.remove(), (e = l));
    }
    t = !0;
  }
  (er(n, r && !t), tr(n), J(n, 0), N(n, j));
  var i = n.transitions;
  if (i !== null) for (const a of i) a.stop();
  rr(n);
  var s = n.parent;
  (s !== null && s.first !== null && lr(n),
    (n.next =
      n.prev =
      n.teardown =
      n.ctx =
      n.deps =
      n.fn =
      n.nodes_start =
      n.nodes_end =
        null));
}
function lr(n) {
  var r = n.parent,
    t = n.prev,
    e = n.next;
  (t !== null && (t.next = e),
    e !== null && (e.prev = t),
    r !== null &&
      (r.first === n && (r.first = e), r.last === n && (r.last = t)));
}
function wn(n, r) {
  var t = [];
  (Nn(n, t, !0),
    ur(t, () => {
      (L(n), r && r());
    }));
}
function ur(n, r) {
  var t = n.length;
  if (t > 0) {
    var e = () => --t || r();
    for (var u of n) u.out(e);
  } else r();
}
function Nn(n, r, t) {
  if (!(n.f & k)) {
    if (((n.f ^= k), n.transitions !== null))
      for (const i of n.transitions) (i.is_global || t) && r.push(i);
    for (var e = n.first; e !== null; ) {
      var u = e.next,
        l = (e.f & Tn) !== 0 || (e.f & A) !== 0;
      (Nn(e, r, l ? t : !1), (e = u));
    }
  }
}
function on(n) {
  ir(n, !0);
}
function ir(n, r) {
  if (n.f & k) {
    (nn(n) && cn(n), (n.f ^= k));
    for (var t = n.first; t !== null; ) {
      var e = t.next,
        u = (t.f & Tn) !== 0 || (t.f & A) !== 0;
      (ir(t, u ? r : !1), (t = e));
    }
    if (n.transitions !== null)
      for (const l of n.transitions) (l.is_global || r) && l.in();
  }
}
function tt(n) {
  throw new Error("lifecycle_outside_component");
}
let en = !1,
  sn = !1,
  Y = !1,
  Sn = !1;
function $n(n) {
  Y = n;
}
function Pn(n) {
  Sn = n;
}
let bn = [],
  G = 0;
let p = null;
function z(n) {
  p = n;
}
let d = null;
function W(n) {
  d = n;
}
let C = null;
function et(n) {
  C = n;
}
let w = null,
  E = 0,
  D = null;
function lt(n) {
  D = n;
}
let or = 0,
  V = !1,
  b = null;
function sr() {
  return ++or;
}
function ut() {
  return !Wr;
}
function nn(n) {
  var i, s;
  var r = n.f;
  if (r & R) return !0;
  if (r & Q) {
    var t = n.deps,
      e = (r & K) !== 0;
    if (t !== null) {
      var u;
      if (r & ln) {
        for (u = 0; u < t.length; u++)
          ((i = t[u]).reactions ?? (i.reactions = [])).push(n);
        n.f ^= ln;
      }
      for (u = 0; u < t.length; u++) {
        var l = t[u];
        if (
          (nn(l) && Zn(l),
          e &&
            d !== null &&
            !V &&
            !(
              (s = l == null ? void 0 : l.reactions) != null && s.includes(n)
            ) &&
            (l.reactions ?? (l.reactions = [])).push(n),
          l.version > n.version)
        )
          return !0;
      }
    }
    e || N(n, m);
  }
  return !1;
}
function it(n, r) {
  for (var t = r; t !== null; ) {
    if (t.f & gn)
      try {
        t.fn(n);
        return;
      } catch {
        t.f ^= gn;
      }
    t = t.parent;
  }
  throw ((en = !1), n);
}
function ot(n) {
  return (n.f & j) === 0 && (n.parent === null || (n.parent.f & gn) === 0);
}
function On(n, r, t, e) {
  if (en) {
    if ((t === null && (en = !1), ot(r))) throw n;
    return;
  }
  t !== null && (en = !0);
  {
    it(n, r);
    return;
  }
}
function fr(n) {
  var v;
  var r = w,
    t = E,
    e = D,
    u = p,
    l = V,
    i = C,
    s = b,
    a = n.f;
  ((w = null),
    (E = 0),
    (D = null),
    (p = a & (A | an) ? null : n),
    (V = !Y && (a & K) !== 0),
    (C = null),
    (b = n.ctx));
  try {
    var f = (0, n.fn)(),
      o = n.deps;
    if (w !== null) {
      var c;
      if ((J(n, E), o !== null && E > 0))
        for (o.length = E + w.length, c = 0; c < w.length; c++) o[E + c] = w[c];
      else n.deps = o = w;
      if (!V)
        for (c = E; c < o.length; c++)
          ((v = o[c]).reactions ?? (v.reactions = [])).push(n);
    } else o !== null && E < o.length && (J(n, E), (o.length = E));
    return f;
  } finally {
    ((w = r), (E = t), (D = e), (p = u), (V = l), (C = i), (b = s));
  }
}
function st(n, r) {
  let t = r.reactions;
  if (t !== null) {
    var e = t.indexOf(n);
    if (e !== -1) {
      var u = t.length - 1;
      u === 0 ? (t = r.reactions = null) : ((t[e] = t[u]), t.pop());
    }
  }
  t === null &&
    r.f & S &&
    (w === null || !w.includes(r)) &&
    (N(r, Q), r.f & (K | ln) || (r.f ^= ln), J(r, 0));
}
function J(n, r) {
  var t = n.deps;
  if (t !== null) for (var e = r; e < t.length; e++) st(n, t[e]);
}
function cn(n) {
  var r = n.f;
  if (!(r & j)) {
    N(n, m);
    var t = d,
      e = b;
    d = n;
    try {
      (r & xn ? rt(n) : er(n), tr(n), rr(n));
      var u = fr(n);
      ((n.teardown = typeof u == "function" ? u : null), (n.version = or));
    } catch (l) {
      On(l, n, t, e || n.ctx);
    } finally {
      d = t;
    }
  }
}
function ft() {
  (G > 1e3 && ((G = 0), Ur()), G++);
}
function at(n) {
  var r = n.length;
  if (r !== 0) {
    ft();
    var t = Y;
    Y = !0;
    try {
      for (var e = 0; e < r; e++) {
        var u = n[e];
        u.f & m || (u.f ^= m);
        var l = [];
        (ar(u, l), ct(l));
      }
    } finally {
      Y = t;
    }
  }
}
function ct(n) {
  var r = n.length;
  if (r !== 0)
    for (var t = 0; t < r; t++) {
      var e = n[t];
      if (!(e.f & (j | k)))
        try {
          nn(e) &&
            (cn(e),
            e.deps === null &&
              e.first === null &&
              e.nodes_start === null &&
              (e.teardown === null ? lr(e) : (e.fn = null)));
        } catch (u) {
          On(u, e, null, e.ctx);
        }
    }
}
function vt() {
  if (((sn = !1), G > 1001)) return;
  const n = bn;
  ((bn = []), at(n), sn || (G = 0));
}
function vn(n) {
  sn || ((sn = !0), queueMicrotask(vt));
  for (var r = n; r.parent !== null; ) {
    r = r.parent;
    var t = r.f;
    if (t & (an | A)) {
      if (!(t & m)) return;
      r.f ^= m;
    }
  }
  bn.push(r);
}
function ar(n, r) {
  var t = n.first,
    e = [];
  n: for (; t !== null; ) {
    var u = t.f,
      l = (u & A) !== 0,
      i = l && (u & m) !== 0,
      s = t.next;
    if (!i && !(u & k))
      if (u & fn) {
        if (l) t.f ^= m;
        else
          try {
            nn(t) && cn(t);
          } catch (c) {
            On(c, t, null, t.ctx);
          }
        var a = t.first;
        if (a !== null) {
          t = a;
          continue;
        }
      } else u & zn && e.push(t);
    if (s === null) {
      let c = t.parent;
      for (; c !== null; ) {
        if (n === c) break n;
        var f = c.next;
        if (f !== null) {
          t = f;
          continue n;
        }
        c = c.parent;
      }
    }
    t = s;
  }
  for (var o = 0; o < e.length; o++) ((a = e[o]), r.push(a), ar(a, r));
}
function q(n) {
  var o;
  var r = n.f,
    t = (r & S) !== 0;
  if (t && r & j) {
    var e = Qn(n);
    return (kn(n), e);
  }
  if (p !== null) {
    C !== null && C.includes(n) && Yr();
    var u = p.deps;
    (w === null && u !== null && u[E] === n
      ? E++
      : w === null
        ? (w = [n])
        : w.push(n),
      D !== null &&
        d !== null &&
        d.f & m &&
        !(d.f & A) &&
        D.includes(n) &&
        (N(d, R), vn(d)));
  } else if (t && n.deps === null)
    for (var l = n, i = l.parent, s = l; i !== null; )
      if (i.f & S) {
        var a = i;
        ((s = a), (i = a.parent));
      } else {
        var f = i;
        ((o = f.deriveds) != null && o.includes(s)) ||
          (f.deriveds ?? (f.deriveds = [])).push(s);
        break;
      }
  return (t && ((l = n), nn(l) && Zn(l)), n.v);
}
function cr(n) {
  const r = p;
  try {
    return ((p = null), n());
  } finally {
    p = r;
  }
}
const _t = ~(R | Q | m);
function N(n, r) {
  n.f = (n.f & _t) | r;
}
function dt(n, r = 1) {
  var t = q(n),
    e = r === 1 ? t++ : t--;
  return (jn(n, t), e);
}
function Mn(n, r = !1, t) {
  b = { p: b, c: null, e: null, m: !1, s: n, x: null, l: null };
}
function Dn(n) {
  const r = b;
  if (r !== null) {
    const i = r.e;
    if (i !== null) {
      var t = d,
        e = p;
      r.e = null;
      try {
        for (var u = 0; u < i.length; u++) {
          var l = i[u];
          (W(l.effect), z(l.reaction), nr(l.fn));
        }
      } finally {
        (W(t), z(e));
      }
    }
    ((b = r.p), (r.m = !0));
  }
  return {};
}
var Bn, vr, _r;
function pt() {
  if (Bn === void 0) {
    Bn = window;
    var n = Element.prototype,
      r = Node.prototype;
    ((vr = Rn(r, "firstChild").get),
      (_r = Rn(r, "nextSibling").get),
      (n.__click = void 0),
      (n.__className = ""),
      (n.__attributes = null),
      (n.__styles = null),
      (n.__e = void 0),
      (Text.prototype.__t = void 0));
  }
}
function dr(n = "") {
  return document.createTextNode(n);
}
function pr(n) {
  return vr.call(n);
}
function Fn(n) {
  return _r.call(n);
}
function x(n, r) {
  return pr(n);
}
function mn(n, r = 1, t = !1) {
  let e = n;
  for (; r--; ) e = Fn(e);
  return e;
}
function ht(n) {
  n.textContent = "";
}
let gt = !1;
const hr = new Set(),
  En = new Set();
function qn(n) {
  for (var r = 0; r < n.length; r++) hr.add(n[r]);
  for (var t of En) t(n);
}
function tn(n) {
  var T;
  var r = this,
    t = r.ownerDocument,
    e = n.type,
    u = ((T = n.composedPath) == null ? void 0 : T.call(n)) || [],
    l = u[0] || n.target,
    i = 0,
    s = n.__root;
  if (s) {
    var a = u.indexOf(s);
    if (a !== -1 && (r === document || r === window)) {
      n.__root = r;
      return;
    }
    var f = u.indexOf(r);
    if (f === -1) return;
    a <= f && (i = a);
  }
  if (((l = u[i] || n.target), l !== r)) {
    Dr(n, "currentTarget", {
      configurable: !0,
      get() {
        return l || t;
      },
    });
    var o = p,
      c = d;
    (z(null), W(null));
    try {
      for (var v, _ = []; l !== null; ) {
        var h = l.assignedSlot || l.parentNode || l.host || null;
        try {
          var y = l["__" + e];
          if (y !== void 0 && !l.disabled)
            if (Yn(y)) {
              var [F, ...g] = y;
              F.apply(l, [n, ...g]);
            } else y.call(l, n);
        } catch (P) {
          v ? _.push(P) : (v = P);
        }
        if (n.cancelBubble || h === r || h === null) break;
        l = h;
      }
      if (v) {
        for (let P of _)
          queueMicrotask(() => {
            throw P;
          });
        throw v;
      }
    } finally {
      ((n.__root = r), delete n.currentTarget, z(o), W(c));
    }
  }
}
function wt(n) {
  var r = document.createElement("template");
  return ((r.innerHTML = n), r.content);
}
function bt(n, r) {
  var t = d;
  t.nodes_start === null && ((t.nodes_start = n), (t.nodes_end = r));
}
function $(n, r) {
  var t = (r & Or) !== 0,
    e,
    u = !n.startsWith("<!>");
  return () => {
    e === void 0 && ((e = wt(u ? n : "<!>" + n)), (e = pr(e)));
    var l = t ? document.importNode(e, !0) : e.cloneNode(!0);
    return (bt(l, l), l);
  };
}
function I(n, r) {
  n !== null && n.before(r);
}
const mt = ["touchstart", "touchmove"];
function Et(n) {
  return mt.includes(n);
}
function gr(n, r) {
  var t = r == null ? "" : typeof r == "object" ? r + "" : r;
  t !== (n.__t ?? (n.__t = n.nodeValue)) &&
    ((n.__t = t), (n.nodeValue = t == null ? "" : t + ""));
}
function yt(n, r) {
  return xt(n, r);
}
const B = new Map();
function xt(
  n,
  { target: r, anchor: t, props: e = {}, events: u, context: l, intro: i = !0 },
) {
  pt();
  var s = new Set(),
    a = (c) => {
      for (var v = 0; v < c.length; v++) {
        var _ = c[v];
        if (!s.has(_)) {
          s.add(_);
          var h = Et(_);
          r.addEventListener(_, tn, { passive: h });
          var y = B.get(_);
          y === void 0
            ? (document.addEventListener(_, tn, { passive: h }), B.set(_, 1))
            : B.set(_, y + 1);
        }
      }
    };
  (a(yn(hr)), En.add(a));
  var f = void 0,
    o = nt(() => {
      var c = t ?? r.appendChild(dr());
      return (
        X(() => {
          if (l) {
            Mn({});
            var v = b;
            v.c = l;
          }
          (u && (e.$$events = u), (f = n(c, e) || {}), l && Dn());
        }),
        () => {
          var h;
          for (var v of s) {
            r.removeEventListener(v, tn);
            var _ = B.get(v);
            --_ === 0
              ? (document.removeEventListener(v, tn), B.delete(v))
              : B.set(v, _);
          }
          (En.delete(a),
            Hn.delete(f),
            c !== t && ((h = c.parentNode) == null || h.removeChild(c)));
        }
      );
    });
  return (Hn.set(f, o), f);
}
let Hn = new WeakMap();
function Tt(n, r, t, e = null, u = !1) {
  var l = n,
    i = null,
    s = null,
    a = null,
    f = u ? Tn : 0;
  An(() => {
    a !== (a = !!r()) &&
      (a
        ? (i ? on(i) : (i = X(() => t(l))),
          s &&
            wn(s, () => {
              s = null;
            }))
        : (s ? on(s) : e && (s = X(() => e(l))),
          i &&
            wn(i, () => {
              i = null;
            })));
  }, f);
}
function kt(n, r) {
  return r;
}
function Ct(n, r, t, e) {
  for (var u = [], l = r.length, i = 0; i < l; i++) Nn(r[i].e, u, !0);
  var s = l > 0 && u.length === 0 && t !== null;
  if (s) {
    var a = t.parentNode;
    (ht(a), a.append(t), e.clear(), M(n, r[0].prev, r[l - 1].next));
  }
  ur(u, () => {
    for (var f = 0; f < l; f++) {
      var o = r[f];
      (s || (e.delete(o.k), M(n, o.prev, o.next)), L(o.e, !s));
    }
  });
}
function At(n, r, t, e, u, l = null) {
  var i = n,
    s = { flags: r, items: new Map(), first: null };
  {
    var a = n;
    i = a.appendChild(dr());
  }
  var f = null,
    o = !1;
  An(() => {
    var c = t(),
      v = Yn(c) ? c : c == null ? [] : yn(c),
      _ = v.length;
    if (!(o && _ === 0)) {
      o = _ === 0;
      {
        var h = p;
        Nt(v, s, i, u, r, (h.f & k) !== 0, e);
      }
      l !== null &&
        (_ === 0
          ? f
            ? on(f)
            : (f = X(() => l(i)))
          : f !== null &&
            wn(f, () => {
              f = null;
            }));
    }
  });
}
function Nt(n, r, t, e, u, l, i) {
  var s = n.length,
    a = r.items,
    f = r.first,
    o = f,
    c,
    v = null,
    _ = [],
    h = [],
    y,
    F,
    g,
    T;
  for (T = 0; T < s; T += 1) {
    if (((y = n[T]), (F = i(y, T)), (g = a.get(F)), g === void 0)) {
      var P = o ? o.e.nodes_start : t;
      ((v = Ot(P, r, v, v === null ? r.first : v.next, y, F, T, e, u)),
        a.set(F, v),
        (_ = []),
        (h = []),
        (o = v.next));
      continue;
    }
    if ((St(g, y, T), g.e.f & k && on(g.e), g !== o)) {
      if (c !== void 0 && c.has(g)) {
        if (_.length < h.length) {
          var rn = h[0],
            O;
          v = rn.prev;
          var In = _[0],
            dn = _[_.length - 1];
          for (O = 0; O < _.length; O += 1) Vn(_[O], rn, t);
          for (O = 0; O < h.length; O += 1) c.delete(h[O]);
          (M(r, In.prev, dn.next),
            M(r, v, In),
            M(r, dn, rn),
            (o = rn),
            (v = dn),
            (T -= 1),
            (_ = []),
            (h = []));
        } else
          (c.delete(g),
            Vn(g, o, t),
            M(r, g.prev, g.next),
            M(r, g, v === null ? r.first : v.next),
            M(r, v, g),
            (v = g));
        continue;
      }
      for (_ = [], h = []; o !== null && o.k !== F; )
        ((l || !(o.e.f & k)) && (c ?? (c = new Set())).add(o),
          h.push(o),
          (o = o.next));
      if (o === null) continue;
      g = o;
    }
    (_.push(g), (v = g), (o = g.next));
  }
  if (o !== null || c !== void 0) {
    for (var pn = c === void 0 ? [] : yn(c); o !== null; )
      ((l || !(o.e.f & k)) && pn.push(o), (o = o.next));
    var Tr = pn.length;
    if (Tr > 0) {
      var kr = s === 0 ? t : null;
      Ct(r, pn, kr, a);
    }
  }
  ((d.first = r.first && r.first.e), (d.last = v && v.e));
}
function St(n, r, t, e) {
  (Gn(n.v, r), (n.i = t));
}
function Ot(n, r, t, e, u, l, i, s, a) {
  var f = (a & Ar) !== 0,
    o = (a & Sr) === 0,
    c = f ? (o ? Kn(u) : un(u)) : u,
    v = a & Nr ? un(i) : i,
    _ = { i: v, v: c, k: l, a: null, e: null, prev: t, next: e };
  try {
    return (
      (_.e = X(() => s(n, c, v), gt)),
      (_.e.prev = t && t.e),
      (_.e.next = e && e.e),
      t === null ? (r.first = _) : ((t.next = _), (t.e.next = _.e)),
      e !== null && ((e.prev = _), (e.e.prev = _.e)),
      _
    );
  } finally {
  }
}
function Vn(n, r, t) {
  for (
    var e = n.next ? n.next.e.nodes_start : t,
      u = r ? r.e.nodes_start : t,
      l = n.e.nodes_start;
    l !== e;
  ) {
    var i = Fn(l);
    (u.before(l), (l = i));
  }
}
function M(n, r, t) {
  (r === null ? (n.first = t) : ((r.next = t), (r.e.next = t && t.e)),
    t !== null && ((t.prev = r), (t.e.prev = r && r.e)));
}
function wr(n, r, t, e) {
  var u = n.__attributes ?? (n.__attributes = {});
  u[r] !== (u[r] = t) &&
    (r === "style" && "__styles" in n && (n.__styles = {}),
    r === "loading" && (n[Lr] = t),
    t == null
      ? n.removeAttribute(r)
      : typeof t != "string" && Mt(n).includes(r)
        ? (n[r] = t)
        : n.setAttribute(r, t));
}
var Un = new Map();
function Mt(n) {
  var r = Un.get(n.nodeName);
  if (r) return r;
  Un.set(n.nodeName, (r = []));
  for (var t, e = Ln(n), u = Element.prototype; u !== e; ) {
    t = Fr(e);
    for (var l in t) t[l].set && r.push(l);
    e = Ln(e);
  }
  return r;
}
function br(n) {
  (b === null && tt(),
    Zr(() => {
      const r = cr(n);
      if (typeof r == "function") return r;
    }));
}
function mr(n, r, t) {
  if (n == null) return (r(void 0), U);
  const e = cr(() => n.subscribe(r, t));
  return e.unsubscribe ? () => e.unsubscribe() : e;
}
function Er(n, r, t) {
  const e =
    t[r] ?? (t[r] = { store: null, source: Kn(void 0), unsubscribe: U });
  if (e.store !== n)
    if ((e.unsubscribe(), (e.store = n ?? null), n == null))
      ((e.source.v = void 0), (e.unsubscribe = U));
    else {
      var u = !0;
      ((e.unsubscribe = mr(n, (l) => {
        u ? (e.source.v = l) : jn(e.source, l);
      })),
        (u = !1));
    }
  return q(e.source);
}
function yr() {
  const n = {};
  return (
    Qr(() => {
      for (var r in n) n[r].unsubscribe();
    }),
    n
  );
}
const H = [];
function Dt(n, r = U) {
  let t = null;
  const e = new Set();
  function u(s) {
    if (Wn(n, s) && ((n = s), t)) {
      const a = !H.length;
      for (const f of e) (f[1](), H.push(f, n));
      if (a) {
        for (let f = 0; f < H.length; f += 2) H[f][0](H[f + 1]);
        H.length = 0;
      }
    }
  }
  function l(s) {
    u(s(n));
  }
  function i(s, a = U) {
    const f = [s, a];
    return (
      e.add(f),
      e.size === 1 && (t = r(u, l) || U),
      s(n),
      () => {
        (e.delete(f), e.size === 0 && t && (t(), (t = null)));
      }
    );
  }
  return { set: u, update: l, subscribe: i };
}
function Ft(n) {
  let r;
  return (mr(n, (t) => (r = t))(), r);
}
const _n = Dt("light");
function qt() {
  const n = Ft(_n),
    r = document.querySelector("div[data-theme]");
  r && r.setAttribute("data-theme", n);
}
function hn() {
  _n.update((n) => {
    const r = n === "light" ? "dark" : "light",
      t = document.querySelector("div[data-theme]");
    return (t && t.setAttribute("data-theme", r), r);
  });
}
var It = $(
    '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>',
  ),
  Rt = $(
    '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"></path></svg>',
  ),
  Lt = $('<button class="btn btn-circle"><!></button>');
function $t(n) {
  const r = yr(),
    t = () => Er(_n, "$theme", r);
  var e = Lt();
  e.__click = function (...l) {
    hn == null || hn.apply(this, l);
  };
  var u = x(e);
  (Tt(
    u,
    () => t() === "light",
    (l) => {
      var i = It();
      I(l, i);
    },
    (l) => {
      var i = Rt();
      I(l, i);
    },
  ),
    I(n, e));
}
qn(["click"]);
const Pt = [
  { icon: "🏠", label: "Home" },
  { icon: "⚙️", label: "Settings" },
  { icon: "❓", label: "Help" },
];
var Bt = $(
    '<button class="btn btn-ghost btn-square"><span class="text-xl"> </span></button>',
  ),
  Ht = $(
    '<aside class="w-16 bg-base-200 p-2"><nav class="flex flex-col gap-4"></nav></aside>',
  );
function Vt(n) {
  var r = Ht(),
    t = x(r);
  (At(
    t,
    21,
    () => Pt,
    kt,
    (e, u) => {
      var l = Bt();
      l.__click = function (...a) {
        var f;
        (f = q(u).action) == null || f.apply(this, a);
      };
      var i = x(l),
        s = x(i);
      (Cn(() => {
        (wr(i, "title", q(u).label), gr(s, q(u).icon));
      }),
        I(e, l));
    },
  ),
    I(n, r));
}
qn(["click"]);
function Ut(n, r) {
  (dt(r), console.log("increment", q(r)));
}
var Yt = $(
  '<div class="card bg-base-200 shadow-xl"><div class="card-body"><h2 class="card-title">Chrome Extension Side Panel</h2> <p>Welcome to your Svelte-powered Chrome extension!</p> <div class="flex items-center gap-4 mt-4"><button class="btn btn-primary"> </button></div></div></div>',
);
function zt(n, r) {
  Mn(r, !0);
  let t = Kr(0);
  br(() => {
    console.log("MainContent mounted");
  });
  var e = Yt(),
    u = x(e),
    l = mn(x(u), 4),
    i = x(l);
  i.__click = [Ut, t];
  var s = x(i);
  (Cn(() => gr(s, `Count: ${q(t) ?? ""}`)), I(n, e), Dn());
}
qn(["click"]);
var Wt = $(
  '<div class="h-screen bg-base-100"><div class="flex h-full"><!> <main class="flex-1 p-4"><div class="flex justify-end mb-4"><!></div> <!></main></div></div>',
);
function Kt(n, r) {
  Mn(r, !0);
  const t = yr(),
    e = () => Er(_n, "$theme", t);
  br(() => {
    qt();
  });
  var u = Wt(),
    l = x(u),
    i = x(l);
  Vt(i);
  var s = mn(i, 2),
    a = x(s),
    f = x(a);
  $t(f);
  var o = mn(a, 2);
  (zt(o, {}), Cn(() => wr(u, "data-theme", e())), I(n, u), Dn());
}
const xr = document.getElementById("app");
if (!xr) throw new Error("Could not find app container");
yt(Kt, { target: xr });
