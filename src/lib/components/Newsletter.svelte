<script>

  import logoSecondary from "$lib/images/RSMC-secondarylogo.svg"
  let email = '';
  
  const subscribe = async (event) => {
    event.preventDefault();
    
    const formData = new FormData();
    formData.append('email', email);
    
    try {
      const response = await fetch('https://eoh4wnenvfev7i9.m.pipedream.net', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      // Show success message
      document.querySelector('.success-message').style.display = 'block';
      document.querySelector('.error-message').style.display = 'none';
    } catch (error) {
      // Show error message
      document.querySelector('.error-message').style.display = 'block';
      document.querySelector('.success-message').style.display = 'none';
    }
  };
</script>

<div class="flex flex-col items-center justify-center mt-24 w-full font-incon">
  <img src="{logoSecondary}" class="w-16 mb-4"/>
  <h2 class="text-3xl mb-4 font-rocks text-white tracking-widest">Join waitlist</h2>
  <span class="text-lg tracking-widest mb-4 font-rocks text-white">( For chance to win free RSMC T-shirt! )</span>
  <form on:submit={subscribe} class="w-full max-w-xs">
    <div class="flex items-center border rounded-none mb-4 ">
      <input
        type="email"
        name="email"
        placeholder="email"
        bind:value={email}
        class="input input-bordered bg-white w-full rounded-none"
        required
      />
      <button type="submit" class="btn bg-black rounded-none text-white uppercase tracking-widest ">submit</button>
    </div>
    <div class="success-message text-green-600" style="display: none;">
      Thank you! Your submission has been received!
    </div>
    <div class="error-message text-red-600" style="display: none;">
      Oops! Something went wrong while submitting the form.
    </div>
  </form>
</div>
