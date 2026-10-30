(function () {
  var API = 'https://easypeeze-tools-j6dbitzprq-el.a.run.app';
  var btn = document.getElementById('payBtn');
  var statusEl = document.getElementById('status');
  var busy = true;
  var payLabel = 'Pay';

  fetch(API + '/client-payment/config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (!cfg || !cfg.ok || !(Number(cfg.amountUsd) > 0)) throw new Error('config');
      var amount = '$' + Number(cfg.amountUsd).toFixed(2);
      document.getElementById('amount').textContent = amount;
      payLabel = 'Pay ' + amount;
      setBusy(false);
    })
    .catch(function () {
      document.getElementById('amount').textContent = '$--';
      btn.textContent = 'Unavailable';
      setStatus('Payments are not available right now. Please refresh or email support@easypeeze.com.', true);
    });

  function setStatus(msg, isError) {
    statusEl.hidden = !msg;
    statusEl.textContent = msg || '';
    statusEl.className = 'pay-status' + (isError ? ' pay-status--error' : '');
  }

  function setBusy(on, label) {
    busy = on;
    btn.disabled = on;
    btn.textContent = label || (on ? 'Please wait...' : payLabel);
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
      'We received $' + Number(info.amount).toFixed(2) + ' ' + (info.currency || 'USD') +
      '. Payment ID: ' + info.paymentId + '. Please keep it for your records.';
  }

  btn.addEventListener('click', function () {
    if (busy) return;
    var buyer = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      reference: document.getElementById('reference').value.trim()
    };
    if (!buyer.name) { setStatus('Please enter your name.', true); return; }
    if (buyer.email.indexOf('@') < 1) { setStatus('Please enter a valid email.', true); return; }
    if (typeof Razorpay === 'undefined') {
      setStatus('The payment window could not load. Please disable ad blockers and refresh.', true);
      return;
    }

    setStatus('', false);
    setBusy(true);
    post('/client-payment/order', buyer)
      .then(function (order) {
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
