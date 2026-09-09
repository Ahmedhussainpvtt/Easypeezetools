(function () {
  var cfg = window.EASYPEEZE_PAY || {};
  var params = new URLSearchParams(location.search);
  var planKey = (params.get('plan') || 'yearly').toLowerCase();
  if (planKey !== 'lifetime') planKey = 'yearly';
  var plan = (cfg.plans && cfg.plans[planKey]) || cfg.plans.yearly;
  var firstNameInput = document.getElementById('firstName');
  var lastNameInput = document.getElementById('lastName');
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  var payBtn = document.getElementById('payBtn');
  var statusEl = document.getElementById('status');
  var priceEl = document.getElementById('pay-price');
  var titleEl = document.getElementById('pay-title');

  if (priceEl && plan) {
    priceEl.innerHTML = '₹' + plan.amountInr + ' <span class="pay-once" id="pay-once">' + (plan.once || '') + '</span>';
  }
  if (titleEl && plan) titleEl.textContent = plan.label || 'Unlock Pdf Buddy';
  if (params.get('email') && emailInput) emailInput.value = params.get('email');

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
    }).then(function (r) { return r.json(); });
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
        modal: { ondismiss: function () { reject(new Error('Checkout closed')); } }
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
      var firstName = normalizeName((firstNameInput && firstNameInput.value) || '');
      var lastName = normalizeName((lastNameInput && lastNameInput.value) || '');
      var email = (emailInput.value || '').trim().toLowerCase();
      var phone = normalizePhone((phoneInput && phoneInput.value) || '');
      if (!isRealPersonName(firstName)) {
        setStatus('Enter a real first name (letters only, not junk like “test” / “asdf”)', true);
        if (firstNameInput) firstNameInput.focus();
        return;
      }
      if (lastName && !isRealPersonName(lastName)) {
        setStatus('Enter a real last name, or leave it blank', true);
        if (lastNameInput) lastNameInput.focus();
        return;
      }
      if (!email || email.indexOf('@') < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus('Enter the Google email you use in Pdf Buddy', true);
        if (emailInput) emailInput.focus();
        return;
      }
      if (!phone) {
        setStatus('Enter a valid phone with country code (e.g. +91 98765 43210)', true);
        if (phoneInput) phoneInput.focus();
        return;
      }
      var buyer = { firstName: firstName, lastName: lastName, email: email, phone: phone };
      var displayName = [firstName, lastName].filter(Boolean).join(' ');
      if (!window.confirm('Pay for ' + (plan.label || 'Pdf Buddy') + ' with:\\n\\n' + displayName + '\\n' + email + '\\n' + phone + '\\n\\nContinue?')) return;
      setStatus('Creating checkout…');
      payBtn.disabled = true;
      createOrder({
        email: email,
        phone: phone,
        firstName: firstName,
        lastName: lastName,
        name: displayName,
        product: cfg.product || 'pdfbuddy',
        planType: plan.planType
      })
        .then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || 'Could not start checkout');
          return openRazorpay(buyer, data);
        })
        .catch(function (e) {
          setStatus((e && e.message) || 'Checkout failed', true);
          payBtn.disabled = false;
        });
    });
  }
})();
