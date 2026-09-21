(function () {
  var cfg = window.EASYPEEZE_PAY || {};
  var params = new URLSearchParams(location.search);
  var productParam = (params.get('product') || cfg.product || 'pdfbuddy').toLowerCase();
  if (productParam === 'kharch' || productParam === 'expense') productParam = 'kharchlog';
  if (productParam !== 'kharchlog') productParam = 'pdfbuddy';
  cfg.product = productParam;

  if (productParam === 'kharchlog') {
    cfg.plans = {
      lifetime: {
        planType: 'lifetime',
        amountInr: 149,
        amountUsd: 2,
        label: 'Kharch Log Lifetime',
        once: 'one-time'
      }
    };
  }

  var planKey = (params.get('plan') || (productParam === 'kharchlog' ? 'lifetime' : 'yearly')).toLowerCase();
  if (productParam === 'kharchlog') planKey = 'lifetime';
  else if (planKey !== 'lifetime') planKey = 'yearly';
  var plan = (cfg.plans && cfg.plans[planKey]) || cfg.plans.yearly || cfg.plans.lifetime;
  var USD_ENABLED = cfg.usdEnabled !== false;
  var requestedCurrency = (params.get('currency') || 'INR').toUpperCase();
  var currency = USD_ENABLED && requestedCurrency === 'USD' ? 'USD' : 'INR';
  var firstNameInput = document.getElementById('firstName');
  var lastNameInput = document.getElementById('lastName');
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  var payBtn = document.getElementById('payBtn');
  var paypalWrap = document.getElementById('paypal-buttons');
  var statusEl = document.getElementById('status');
  var priceEl = document.getElementById('pay-price');
  var titleEl = document.getElementById('pay-title');
  var fineEl = document.getElementById('pay-fine');

  function refreshUsdFromHealth() {
    if (!cfg.trackerUrl) return Promise.resolve();
    return fetch(cfg.trackerUrl.replace(/\/$/, '') + '/health', { credentials: 'omit' })
      .then(function (r) {
        return r.json();
      })
      .then(function (h) {
        if (!h || !h.ok) return;
        USD_ENABLED = !!(h.usdEnabled && h.razorpay);
        if (!USD_ENABLED && currency === 'USD') currency = 'INR';
        else if (USD_ENABLED && requestedCurrency === 'USD') currency = 'USD';
        syncPrice();
      })
      .catch(function () {});
  }

  function priceLabel() {
    if (!plan) return '';
    if (currency === 'USD') return '$' + plan.amountUsd;
    return '₹' + plan.amountInr;
  }

  function syncPrice() {
    if (priceEl && plan) {
      priceEl.innerHTML =
        priceLabel() + ' <span class="pay-once" id="pay-once">' + (plan.once || '') + '</span>';
    }
    if (payBtn) {
      payBtn.hidden = false;
      payBtn.classList.remove('is-hidden');
      payBtn.setAttribute('aria-hidden', 'false');
      payBtn.textContent = 'Continue to pay';
    }
    if (paypalWrap) {
      paypalWrap.hidden = true;
      paypalWrap.classList.add('is-hidden');
    }
    if (fineEl && productParam !== 'kharchlog') {
      fineEl.innerHTML =
        currency === 'USD'
          ? 'Secure checkout via Razorpay (USD, PayPal available in the payment window). <a href="../download/" rel="noopener">Download free instead</a> · <a href="../pricing/">Back to pricing</a>'
          : '<a href="../download/" rel="noopener">Download free instead</a> · <a href="../pricing/">Back to pricing</a>';
    }
    document.querySelectorAll('.pay-currency__btn').forEach(function (btn) {
      var isUsd = btn.getAttribute('data-currency') === 'USD';
      btn.classList.toggle('is-active', (isUsd && currency === 'USD') || (!isUsd && currency === 'INR'));
      if (isUsd && !USD_ENABLED) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('pay-currency__btn--soon');
        if (btn.querySelector('.pay-currency__soon') === null) {
          btn.innerHTML =
            'Pay in $ USD <span class="pay-currency__soon">Coming soon</span>';
        }
      } else if (isUsd && USD_ENABLED) {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('pay-currency__btn--soon');
        btn.textContent = 'Pay in $ USD';
      }
    });
  }

  syncPrice();
  refreshUsdFromHealth();
  if (titleEl && plan) {
    titleEl.textContent =
      plan.label || (productParam === 'kharchlog' ? 'Unlock Kharch Log' : 'Unlock Pdf Buddy');
  }
  var subEl = document.getElementById('pay-sub');
  if (subEl) {
    subEl.textContent =
      productParam === 'kharchlog'
        ? 'Use the same Google email you sign in with in the Android app.'
        : 'Use the same Google email you sign in with in the Windows app.';
  }
  var tipEl = document.querySelector('.pay-email-check');
  if (tipEl && productParam === 'kharchlog') {
    tipEl.textContent = 'Download the APK from kharchlog.com after payment - sign in with this Google email.';
  }
  if (fineEl && productParam === 'kharchlog') {
    fineEl.innerHTML =
      '<a href="https://kharchlog.com/" rel="noopener">Kharch Log home</a> · <a href="../pricing/#kharch-log">Back to pricing</a>';
  }
  if (params.get('email') && emailInput) emailInput.value = params.get('email');

  document.querySelectorAll('.pay-currency__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      currency = btn.getAttribute('data-currency') === 'USD' ? 'USD' : 'INR';
      syncPrice();
    });
  });

  function setStatus(msg, isError) {
    if (!statusEl) return;
    var text = String(msg || '').trim();
    if (!text) {
      statusEl.textContent = '';
      statusEl.hidden = true;
      statusEl.className = 'pay-status';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = 'pay-status' + (isError ? ' pay-status-error' : ' pay-status-ok');
    if (isError) {
      try {
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_e) {}
    }
  }

  function paymentFailMessage(err, fallback) {
    if (!err) return fallback || 'Payment failed. Please try again.';
    if (typeof err === 'string' && err.trim()) {
      err = { message: err.trim() };
    }
    var msg =
      (err.error && String(err.error)) ||
      (err.message && String(err.message)) ||
      (err.details && err.details[0] && (err.details[0].description || err.details[0].issue)) ||
      '';
    msg = String(msg || '').trim();
    if (!msg || /VALIDATION|Fix the form/i.test(msg)) {
      return fallback || 'Payment failed. Please try again.';
    }
    // PayPal fires this when the popup is closed / cancelled.
    if (
      /window is closed/i.test(msg) ||
      /can not determine type|cannot determine type/i.test(msg) ||
      /Checkout closed|dismiss|cancelled|canceled/i.test(msg)
    ) {
      return 'Looks like you closed the payment window. Please try again when you’re ready.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return 'Could not reach the payment server. Check your connection and try again.';
    }
    return msg;
  }

  if (params.get('cancelled') === '1' || params.get('cancel') === '1') {
    setStatus('Looks like you closed the payment window. Please try again when you’re ready.', true);
  }

  var NAME_BLOCKLIST = {
    test: 1, asdf: 1, asdfgh: 1, qwerty: 1, qwertyuiop: 1, abc: 1, abcd: 1, abcde: 1,
    xyz: 1, xxx: 1, aaa: 1, bbb: 1, ccc: 1, name: 1, fname: 1, lname: 1, firstname: 1,
    lastname: 1, user: 1, username: 1, admin: 1, null: 1, undefined: 1, none: 1, na: 1,
    foo: 1, bar: 1, baz: 1, spam: 1, fake: 1, guest: 1, demo: 1, sample: 1, zxcvbn: 1,
    hjkl: 1, anon: 1, anonymous: 1, me: 1, you: 1, hi: 1, hey: 1, ok: 1, idk: 1
  };

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isRealPersonName(value) {
    var name = normalizeName(value);
    if (name.length < 2 || name.length > 40) return false;
    if (
      !/^[A-Za-z\u00C0-\u024F\u0900-\u097F](?:[A-Za-z\u00C0-\u024F\u0900-\u097F\s'.-]{0,38}[A-Za-z\u00C0-\u024F\u0900-\u097F])?$/.test(
        name
      )
    ) {
      return false;
    }
    var compact = name.replace(/[\s'.-]/g, '');
    if (compact.length < 2) return false;
    if (/^(.)\1+$/i.test(compact)) return false;
    if (/(.)\1{2,}/i.test(compact)) return false;
    var key = compact.toLowerCase();
    if (NAME_BLOCKLIST[key]) return false;
    if (/^[A-Za-z]+$/.test(compact) && !/[aeiouy]/i.test(compact)) return false;
    return true;
  }

  function normalizePhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var digits = s.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      digits = '91' + digits;
    } else if (digits.length === 11 && digits.charAt(0) === '0' && /^[6-9]\d{9}$/.test(digits.slice(1))) {
      digits = '91' + digits.slice(1);
    }
    if (digits.length < 11 || digits.length > 15) return null;
    if (/^(\d)\1+$/.test(digits)) return null;
    if (digits.indexOf('91') === 0 && digits.length === 12 && !/^91[6-9]\d{9}$/.test(digits)) {
      return null;
    }
    if (
      /^91(0{10}|1{10}|2{10}|3{10}|4{10}|5{10}|6{10}|7{10}|8{10}|9{10}|1234567890|0123456789|9876543210)$/.test(
        digits
      )
    ) {
      return null;
    }
    return '+' + digits;
  }

  function apiBase() {
    return String(cfg.trackerUrl || '').replace(/\/$/, '');
  }

  function createOrder(payload) {
    return fetch(apiBase() + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json();
    });
  }

  function readBuyer() {
    var firstName = normalizeName((firstNameInput && firstNameInput.value) || '');
    var lastName = normalizeName((lastNameInput && lastNameInput.value) || '');
    var email = (emailInput.value || '').trim().toLowerCase();
    var phone = normalizePhone((phoneInput && phoneInput.value) || '');
    if (!isRealPersonName(firstName)) {
      setStatus('Please enter your first name.', true);
      if (firstNameInput) firstNameInput.focus();
      return null;
    }
    if (lastName && !isRealPersonName(lastName)) {
      setStatus('Please enter a valid last name, or leave this field blank.', true);
      if (lastNameInput) lastNameInput.focus();
      return null;
    }
    if (!email || email.indexOf('@') < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(
        productParam === 'kharchlog'
          ? 'Enter the Google email you use in Kharch Log'
          : 'Enter the Google email you use in Pdf Buddy',
        true
      );
      if (emailInput) emailInput.focus();
      return null;
    }
    if (!phone) {
      setStatus('Enter a valid phone with country code (e.g. +91 98765 43210)', true);
      if (phoneInput) phoneInput.focus();
      return null;
    }
    return {
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: phone,
      displayName: [firstName, lastName].filter(Boolean).join(' ')
    };
  }

  function openRazorpay(buyer, orderData) {
    return new Promise(function (resolve, reject) {
      var fullName = [buyer.firstName, buyer.lastName].filter(Boolean).join(' ');
      var options = {
        key: orderData.razorpayKeyId || cfg.razorpayKeyId,
        name: 'Easy Peeze Tools',
        description: plan.label,
        prefill: { name: fullName, email: buyer.email, contact: buyer.phone || '' },
        notes: {
          email: buyer.email,
          firstName: buyer.firstName,
          lastName: buyer.lastName,
          name: fullName,
          product: cfg.product || 'pdfbuddy',
          planType: plan.planType,
          currency: orderData.currency || currency
        },
        theme: { color: '#0085FF' },
        handler: function (response) {
          var q = new URLSearchParams();
          q.set('email', buyer.email);
          q.set('firstName', buyer.firstName);
          q.set('lastName', buyer.lastName);
          q.set('product', cfg.product || 'pdfbuddy');
          q.set('plan', plan.planType);
          q.set('phone', buyer.phone || '');
          if (response.razorpay_payment_id) q.set('payment_id', response.razorpay_payment_id);
          if (response.razorpay_order_id) q.set('order_id', response.razorpay_order_id);
          if (response.razorpay_subscription_id) q.set('subscription_id', response.razorpay_subscription_id);
          if (response.razorpay_signature) q.set('signature', response.razorpay_signature);
          window.location.href = 'success.html?' + q.toString();
          resolve({ ok: true });
        },
        modal: {
          ondismiss: function () {
            reject(
              new Error('Looks like you closed the payment window. Please try again when you’re ready.')
            );
          }
        }
      };
      if (orderData.mode === 'subscription' && orderData.subscriptionId) {
        options.subscription_id = orderData.subscriptionId;
      } else {
        options.order_id = orderData.orderId;
        options.amount = orderData.amount;
        options.currency = orderData.currency || 'INR';
      }
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        var detail =
          (resp && resp.error && (resp.error.description || resp.error.reason || resp.error.code)) ||
          'Payment failed';
        reject(new Error('Payment failed: ' + detail + '. Please try again.'));
      });
      rzp.open();
    });
  }

  if (payBtn) {
    payBtn.addEventListener('click', function () {
      var buyer = readBuyer();
      if (!buyer) return;
      if (
        !window.confirm(
          'Pay ' +
            priceLabel() +
            ' for ' +
            (plan.label || 'Pdf Buddy') +
            ' with:\n\n' +
            buyer.displayName +
            '\n' +
            buyer.email +
            '\n' +
            buyer.phone +
            '\n\nContinue?'
        )
      )
        return;
      setStatus('Creating checkout…');
      payBtn.disabled = true;
      createOrder({
        email: buyer.email,
        phone: buyer.phone,
        firstName: buyer.firstName,
        lastName: buyer.lastName,
        name: buyer.displayName,
        product: cfg.product || 'pdfbuddy',
        planType: plan.planType,
        currency: currency,
        staging: !!cfg.staging
      })
        .then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || 'Could not start checkout');
          if (data.provider !== 'razorpay') {
            throw new Error('Unexpected payment provider');
          }
          return openRazorpay(buyer, data);
        })
        .catch(function (e) {
          setStatus(paymentFailMessage(e, 'Checkout failed. Please try again.'), true);
          payBtn.disabled = false;
        });
    });
  }
})();
