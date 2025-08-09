
(function(){
  const style = document.createElement('style');
  style.innerHTML = `body{font-family:Arial,sans-serif;background:#f4f4f4}.survey-container{max-width:400px;margin:50px auto;padding:20px;background:#fff;border-radius:6px;box-shadow:0 2px 5px rgba(0,0,0,.2)}label{display:block;margin-top:10px}button,input,select{width:100%;padding:8px;margin-top:5px}button{margin-top:15px;background:#007bff;color:#fff;border:none}button:hover{background:#0056b3}`;
  document.head.appendChild(style);

  const container = document.createElement('div');
  container.innerHTML = `<div class="survey-container"><h1>Customer Feedback Survey</h1><form id="surveyForm"><label>Name:</label> <input type="text" name="name" required> <label>Email:</label> <input type="email" name="email" required> <label>How satisfied are you with our service?</label> <select name="rating" required><option value="">Select...</option><option>Very Satisfied</option><option>Satisfied</option><option>Neutral</option><option>Dissatisfied</option><option>Very Dissatisfied</option></select> <button type="submit">Submit</button></form><p id="response"></p></div>`;
  document.body.appendChild(container);

  document.getElementById("surveyForm").addEventListener("submit",function(e){e.preventDefault();const t=this.name.value,n=this.rating.value;document.getElementById("response").textContent=`Thank you ${t}! You rated us "${n}".`,this.reset()});
})();
