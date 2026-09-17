(function () {
  var cfg = window.EASYPEEZE_PAY || {};
  var params = new URLSearchParams(location.search);
  var planKey = (params.get('plan') || 'yearly').toLowerCase();
  if (planKey !== 'lifetime') planKey = 'yearly';
  var plan = (cfg.plans && cfg.plans[planKey]) || cfg.plans.yearly;
  var USD_ENABLED = !!(cfg.paypalClientId || cfg.usdEnabled);
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
  var paypalSdkReady = null;
  var paypalRendered = false;

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
      payBtn.hidden = currency === 'USD';
      payBtn.classList.toggle('is-hidden', currency === 'USD');
      payBtn.setAttribute('aria-hidden', currency === 'USD' ? 'true' : 'false');
      payBtn.textContent =
        currency === 'USD' ? 'Pay with PayPal' : 'Continue to pay';
    }
    if (paypalWrap) {
      paypalWrap.hidden = currency !== 'USD';
      paypalWrap.classList.toggle('is-hidden', currency !== 'USD');
    }
    if (fineEl) {
      fineEl.innerHTML =
        currency === 'USD'
          ? 'Secure checkout via PayPal (USD). <a href="../download/" rel="noopener">Download free instead</a> · <a href="../pricing/">Back to pricing</a>'
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
    if (currency === 'USD' && USD_ENABLED) {
      ensurePaypalButtons();
    }
  }

  syncPrice();
  if (titleEl && plan) titleEl.textContent = plan.label || 'Unlock Pdf Buddy';
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
    statusEl.textContent = msg || '';
    statusEl.className = 'pay-status' + (isError ? ' pay-status-error' : '');
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

  function capturePaypal(payload) {
    return fetch(apiBase() + '/paypal/capture', {
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
      setStatus('Enter a real first name (letters only, not junk like “test” / “asdf”)', true);
      if (firstNameInput) firstNameInput.focus();
      return null;
    }
    if (lastName && !isRealPersonName(lastName)) {
      setStatus('Enter a real last name, or leave it blank', true);
      if (lastNameInput) lastNameInput.focus();
      return null;
    }
    if (!email || email.indexOf('@') < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Enter the Google email you use in Pdf Buddy', true);
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

  function loadPaypalSdk() {
    if (window.paypal) return Promise.resolve();
    if (paypalSdkReady) return paypalSdkReady;
    var clientId = cfg.paypalClientId;
    if (!clientId) return Promise.reject(new Error('PayPal is not configured'));
    var sandbox = String(cfg.paypalMode || 'sandbox').toLowerCase() !== 'live';
    // Sandbox host + buyer-country keeps funding options stable when testing from IN.
    var sdkHost = sandbox ? 'https://www.sandbox.paypal.com/sdk/js' : 'https://www.paypal.com/sdk/js';
    var qs =
      'client-id=' +
      encodeURIComponent(clientId) +
      '&currency=USD&intent=capture&components=buttons' +
      (sandbox ? '&buyer-country=US' : '');
    paypalSdkReady = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = sdkHost + '?' + qs;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('PayPal SDK failed to load'));
      };
      document.head.appendChild(s);
    });
    return paypalSdkReady;
  }

  function ensurePaypalButtons() {
    if (!paypalWrap || paypalRendered || !USD_ENABLED) return;
    loadPaypalSdk()
      .then(function () {
        if (paypalRendered || !window.paypal) return;
        paypalRendered = true;
        window.paypal
          .Buttons({
            style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
            createOrder: function () {
              var buyer = readBuyer();
              if (!buyer) return Promise.reject(new Error('Fix the form fields first'));
              setStatus('Creating PayPal order…');
              return createOrder({
                email: buyer.email,
                phone: buyer.phone,
                firstName: buyer.firstName,
                lastName: buyer.lastName,
                name: buyer.displayName,
                product: cfg.product || 'pdfbuddy',
                planType: plan.planType,
                currency: 'USD',
                staging: !!cfg.staging
              }).then(function (orderData) {
                if (!orderData || !orderData.ok || orderData.provider !== 'paypal' || !orderData.orderId) {
                  throw new Error((orderData && orderData.error) || 'Could not start PayPal checkout');
                }
                setStatus('Continue in PayPal…');
                return orderData.orderId;
              });
            },
            onApprove: function (data) {
              var buyer = readBuyer() || {
                email: (emailInput.value || '').trim().toLowerCase(),
                firstName: normalizeName((firstNameInput && firstNameInput.value) || ''),
                lastName: normalizeName((lastNameInput && lastNameInput.value) || ''),
                phone: normalizePhone((phoneInput && phoneInput.value) || '') || ''
              };
              setStatus('Confirming PayPal payment…');
              return capturePaypal({
                orderId: data.orderID,
                email: buyer.email,
                phone: buyer.phone,
                firstName: buyer.firstName,
                lastName: buyer.lastName,
                product: cfg.product || 'pdfbuddy',
                planType: plan.planType,
                staging: !!cfg.staging
              }).then(function (result) {
                if (!result || !result.ok) {
                  throw new Error((result && result.error) || 'PayPal capture failed');
                }
                var q = new URLSearchParams();
                q.set('email', result.email || buyer.email);
                q.set('firstName', buyer.firstName || '');
                q.set('lastName', buyer.lastName || '');
                q.set('product', cfg.product || 'pdfbuddy');
                q.set('plan', plan.planType);
                q.set('phone', buyer.phone || '');
                q.set('provider', 'paypal');
                if (result.paymentId) q.set('payment_id', result.paymentId);
                if (result.orderId) q.set('order_id', result.orderId);
                q.set('paid', result.paid ? '1' : '0');
                if (result.staging) q.set('staging', '1');
                if (result.message) q.set('msg', result.message);
                window.location.href = 'success.html?' + q.toString();
              });
            },
            onCancel: function () {
              setStatus('PayPal checkout cancelled');
            },
            onError: function (err) {
              var detail = (err && (err.message || err)) || '';
              setStatus(
                'PayPal checkout failed — log in with a sandbox Personal buyer account (not guest card). ' +
                  detail,
                true
              );
            }
          })
          .render('#paypal-buttons');
      })
      .catch(function (e) {
        setStatus((e && e.message) || 'PayPal failed to load', true);
      });
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
          product: 'pdfbuddy',
          planType: plan.planType
        },
        theme: { color: '#0085FF' },
        handler: function (response) {
          var q = new URLSearchParams();
          q.set('email', buyer.email);
          q.set('firstName', buyer.firstName);
          q.set('lastName', buyer.lastName);
          q.set('product', 'pdfbuddy');
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
            reject(new Error('Checkout closed'));
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
        reject(new Error((resp.error && resp.error.description) || 'Payment failed'));
      });
      rzp.open();
    });
  }

  if (payBtn) {
    payBtn.addEventListener('click', function () {
      if (currency === 'USD') {
        setStatus('Use the PayPal buttons below to pay in USD');
        ensurePaypalButtons();
        return;
      }
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
          if (data.provider === 'paypal') {
            throw new Error('Use the PayPal buttons for USD checkout');
          }
          if (data.provider !== 'razorpay') {
            throw new Error('Unexpected payment provider');
          }
          return openRazorpay(buyer, data);
        })
        .catch(function (e) {
          setStatus((e && e.message) || 'Checkout failed', true);
          payBtn.disabled = false;
        });
    });
  }
})();
