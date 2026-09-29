if (u.lockedDuration) {
  // Only show that duration option, disable the select
  document.getElementById('order-duration').value = u.lockedDuration;
  document.getElementById('order-duration').disabled = true;
}