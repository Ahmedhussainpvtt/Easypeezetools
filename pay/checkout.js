(function () {
  var cfg = window.EASYPEEZE_PAY || {};
  var params = new URLSearchParams(location.search);
  var planKey = (params.get('plan') || 'yearly').toLowerCase();
  if (planKey !== 'lifetime') planKey = 'yearly';
  var plan = (cfg.plans && cfg.plans[planKey]) || cfg.plans.yearly;
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  var payBtn = document.getElementById('payBtn');
  var statusEl = document.getElementById('status');
  var priceEl = document.getElementById('pay-price');
  var onceEl = document.getElementById('pay-once');
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

  function apiBase() {
    return String(cfg.trackerUrl || '').replace(/\/$/, '');
  }

  function createOrder(email, phone) {
    return fetch(apiBase() + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        phone: phone || '',
        product: cfg.product || 'pdfbuddy',
        planType: plan.planType
      })
    }).then(function (r) { return r.json(); });
  }

  function openRazorpay(email, phone, orderData) {
    return new Promise(function (resolve, reject) {
      var options = {
        key: orderData.razorpayKeyId || cfg.razorpayKeyId,
        name: 'Easy Peeze Tools',
        description: plan.label,
        prefill: { email: email, contact: phone || '' },
        notes: { email: email, product: 'pdfbuddy', planType: plan.planType },
        theme: { color: '#0F2A43' },
        handler: function (response) {
          var q = new URLSearchParams();
          q.set('email', email);
          q.set('product', 'pdfbuddy');
          q.set('plan', plan.planType);
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
      var email = (emailInput.value || '').trim().toLowerCase();
      var phone = ((phoneInput && phoneInput.value) || '').replace(/\D/g, '').slice(-10);
      if (!email || email.indexOf('@') < 1) {
        setStatus('Enter the Google email you use in Pdf Buddy', true);
        return;
      }
      if (!window.confirm('Pay for ' + (plan.label || 'Pdf Buddy') + ' with:\\n\\n' + email + '\\n\\nContinue?')) return;
      setStatus('Creating checkout…');
      payBtn.disabled = true;
      createOrder(email, phone)
        .then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || 'Could not start checkout');
          return openRazorpay(email, phone, data);
        })
        .catch(function (e) {
          setStatus((e && e.message) || 'Checkout failed', true);
          payBtn.disabled = false;
        });
    });
  }
})();
