(function () {
  var API = 'https://easypeeze-tools-j6dbitzprq-el.a.run.app';
  var btn = document.getElementById('payBtn');
  var statusEl = document.getElementById('status');
  var amountInput = document.getElementById('amountInput');
  var nameInput = document.getElementById('name');
  var emailInput = document.getElementById('email');
  var presetsEl = document.getElementById('presets');
  var hintEl = document.getElementById('amountHint');
  var payHint = document.getElementById('payHint');
  var busy = false;
  var ready = false;
  var captchaToken = '';
  var minUsd = 0;
  var maxUsd = 0;

  window.onPayCaptchaOk = function (token) {
    captchaToken = String(token || '');
    refresh();
  };
  window.onPayCaptchaExpired = function () {
    captchaToken = '';
    refresh();
  };

  btn.disabled = true;
  btn.textContent = 'Loading...';

  fetch(API + '/client-payment/config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (!cfg || !cfg.ok || !cfg.customAmount || !(Number(cfg.minUsd) > 0) || !(Number(cfg.maxUsd) > 0)) {
        throw new Error('config');
      }
      minUsd = Number(cfg.minUsd);
      maxUsd = Number(cfg.maxUsd);
      (cfg.presetsUsd || []).forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'client-pay__preset';
        b.textContent = '$' + Number(v).toLocaleString('en-US');
        b.setAttribute('data-amount', String(v));
        b.addEventListener('click', function () {
          amountInput.value = String(v);
          refresh();
          amountInput.focus();
        });
        presetsEl.appendChild(b);
      });
      hintEl.textContent = 'Tap an amount or type your own, from $' + fmtWhole(minUsd) + ' to $' + fmtWhole(maxUsd) + '.';
      ready = true;
      refresh();
    })
    .catch(function () {
      ready = false;
      btn.disabled = true;
      btn.textContent = 'Unavailable';
      setStatus('Payments are not available right now. Please refresh or email support@easypeeze.com.', true);
    });

  [amountInput, nameInput, emailInput].forEach(function (el) {
    el.addEventListener('input', refresh);
  });

  function fmtWhole(n) {
    return Number(n).toLocaleString('en-US');
  }

  function fmtUsd(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Whole cents between min and max, or null. Zero, blank and anything out of range are null. */
  function readAmount() {
    if (!ready) return null;
    var text = amountInput.value.trim().replace(/^\$/, '').replace(/,/g, '');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
    var n = Number(text);
    if (!(n > 0 && n >= minUsd && n <= maxUsd)) return null;
    return Math.round(n * 100) / 100;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  /** What is still missing, in order. Empty when the form can be paid. */
  function missing() {
    var out = [];
    if (readAmount() === null) out.push('an amount');
    if (!nameInput.value.trim()) out.push('your name');
    if (!validEmail(emailInput.value.trim())) out.push('a valid email');
    if (!captchaToken) out.push('the reCAPTCHA');
    return out;
  }

  function refresh() {
    var n = readAmount();
    var buttons = presetsEl.querySelectorAll('.client-pay__preset');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-on', n !== null && Number(buttons[i].getAttribute('data-amount')) === n);
    }
    if (!ready || busy) return;
    var need = missing();
    btn.disabled = need.length > 0;
    btn.textContent = n === null ? 'Pay' : 'Pay ' + fmtUsd(n);
    if (payHint) {
      payHint.textContent = need.length ? 'Still needed: ' + need.join(', ') + '.' : 'Ready to pay.';
    }
    if (statusEl.className.indexOf('error') >= 0 && !need.length) setStatus('', false);
  }

  function resetCaptcha() {
    captchaToken = '';
    try {
      if (window.grecaptcha) grecaptcha.reset();
    } catch (_) {}
  }

  function setStatus(msg, isError) {
    statusEl.hidden = !msg;
    statusEl.textContent = msg || '';
    statusEl.className = 'pay-status' + (isError ? ' pay-status--error' : '');
  }

  function setBusy(on, label) {
    busy = on;
    if (on) {
      btn.disabled = true;
      btn.textContent = label || 'Please wait...';
    } else {
      refresh();
    }
  }

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
        return j;
      });
    });
  }

  function showDone(info) {
    document.getElementById('payForm').hidden = true;
    document.getElementById('payDone').hidden = false;
    document.getElementById('doneText').textContent =
      'We received ' + fmtUsd(info.amount) + ' ' + (info.currency || 'USD') +
      '. Payment ID: ' + info.paymentId + '. Please keep it for your records.';
  }

  btn.addEventListener('click', function () {
    if (busy || !ready || missing().length) return;
    var amountUsd = readAmount();
    if (typeof Razorpay === 'undefined') {
      setStatus('The payment window could not load. Please disable ad blockers and refresh.', true);
      return;
    }
    var buyer = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: document.getElementById('phone').value.trim(),
      reference: document.getElementById('reference').value.trim(),
      amountUsd: amountUsd.toFixed(2),
      'g-recaptcha-response': captchaToken
    };

    setStatus('', false);
    setBusy(true);
    post('/client-payment/order', buyer)
      .then(function (order) {
        // A reCAPTCHA token works once; the next attempt needs a fresh tick.
        resetCaptcha();
        if (Number(order.amount) !== Math.round(amountUsd * 100) || String(order.currency) !== 'USD') {
          throw new Error('The amount could not be set. Please refresh and try again.');
        }
        var rzp = new Razorpay({
          key: order.razorpayKeyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: 'Easy Peeze Tools',
          description: buyer.reference || 'Payment',
          prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
          notes: { kind: 'client_payment' },
          theme: { color: '#0085FF' },
          handler: function (resp) {
            setBusy(true, 'Confirming payment...');
            post('/client-payment/verify', {
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature
            })
              .then(showDone)
              .catch(function () {
                setBusy(false);
                setStatus(
                  'Your payment went through, but we could not confirm it here. Please keep payment ID ' +
                    resp.razorpay_payment_id + ' and email support@easypeeze.com.',
                  true
                );
              });
          },
          modal: {
            ondismiss: function () { setBusy(false); }
          }
        });
        rzp.on('payment.failed', function (r) {
          setBusy(false);
          setStatus((r && r.error && r.error.description) || 'Payment failed. Please try again.', true);
        });
        rzp.open();
      })
      .catch(function (err) {
        resetCaptcha();
        setBusy(false);
        setStatus(err.message, true);
      });
  });
})();
