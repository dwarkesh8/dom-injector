document.getElementById('surveyForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const name = this.name.value;
  const rating = this.rating.value;
  document.getElementById('response').textContent =
    `Thank you ${name}! You rated us "${rating}".`;
  this.reset();
});
