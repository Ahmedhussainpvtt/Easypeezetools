(function () {
  var API = 'https://easypeeze-tools-j6dbitzprq-el.a.run.app';
  var btn = document.getElementById('payBtn');
  var statusEl = document.getElementById('status');
  var amountInput = document.getElementById('amountInput');
  var presetsEl = document.getElementById('presets');
  var hintEl = document.getElementById('amountHint');
  var busy = true;
  var ready = false;
  var minUsd = 1;
  var maxUsd = 10000;

  fetch(API + '/client-payment/config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (!cfg || !cfg.ok || !cfg.customAmount) throw new Error('config');
      minUsd = Number(cfg.minUsd) || minUsd;
      maxUsd = Number(cfg.maxUsd) || maxUsd;
      (cfg.presetsUsd || []).forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'client-pay__preset';
        b.textContent = '$' + Number(v).toLocaleString('en-US');
        b.setAttribute('data-amount', String(v));
        b.addEventListener('click', function () {
          amountInput.value = String(v);
          onAmount();
          amountInput.focus();
        });
        presetsEl.appendChild(b);
      });
      hintEl.textContent = 'Tap an amount or type your own, from $' + fmtWhole(minUsd) + ' to $' + fmtWhole(maxUsd) + '.';
      ready = true;
      setBusy(false);
    })
    .catch(function () {
      btn.textContent = 'Unavailable';
      setStatus('Payments are not available right now. Please refresh or email support@easypeeze.com.', true);
    });

  amountInput.addEventListener('input', onAmount);

  function fmtWhole(n) {
    return Number(n).toLocaleString('en-US');
  }

  function fmtUsd(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Whole cents between min and max, or null. */
  function readAmount() {
    var text = amountInput.value.trim().replace(/^\$/, '').replace(/,/g, '');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
    var n = Number(text);
    if (!(n >= minUsd && n <= maxUsd)) return null;
    return Math.round(n * 100) / 100;
  }

  function onAmount() {
    var n = readAmount();
    var buttons = presetsEl.querySelectorAll('.client-pay__preset');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-on', n !== null && Number(buttons[i].getAttribute('data-amount')) === n);
    }
    if (!busy) btn.textContent = payLabel();
    if (statusEl.className.indexOf('error') >= 0) setStatus('', false);
  }

  function payLabel() {
    var n = readAmount();
    return n === null ? 'Pay' : 'Pay ' + fmtUsd(n);
  }

  function setStatus(msg, isError) {
    statusEl.hidden = !msg;
    statusEl.textContent = msg || '';
    statusEl.className = 'pay-status' + (isError ? ' pay-status--error' : '');
  }

  function setBusy(on, label) {
    busy = on;
    btn.disabled = on || !ready;
    btn.textContent = label || (on ? 'Please wait...' : payLabel());
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
    if (busy || !ready) return;
    var amountUsd = readAmount();
    var buyer = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      reference: document.getElementById('reference').value.trim()
    };
    if (amountUsd === null) {
      setStatus('Please enter an amount between $' + fmtWhole(minUsd) + ' and $' + fmtWhole(maxUsd) + '.', true);
      amountInput.focus();
      return;
    }
    if (!buyer.name) { setStatus('Please enter your name.', true); return; }
    if (buyer.email.indexOf('@') < 1) { setStatus('Please enter a valid email.', true); return; }
    if (typeof Razorpay === 'undefined') {
      setStatus('The payment window could not load. Please disable ad blockers and refresh.', true);
      return;
    }

    setStatus('', false);
    setBusy(true);
    buyer.amountUsd = amountUsd.toFixed(2);
    post('/client-payment/order', buyer)
      .then(function (order) {
        if (Number(order.amount) !== Math.round(amountUsd * 100)) {
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
        setBusy(false);
        setStatus(err.message, true);
      });
  });
})();
