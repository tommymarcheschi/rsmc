<script>
  import logowithtype from "$lib/images/RSMC-logo-white-type.svg";
  import { isEmail, isMessageValid } from '$lib/utils'; 


  let name = '';
  let email = '';
  let message = '';
  let responseMessage = '';
  let isSuccess = false;

  let toastOpacity = 1;

  async function handleSubmit(event) {
    event.preventDefault();


    // Validate email before submitting
    if (!isEmail(email)) {
      responseMessage = 'invalid email address';
      isSuccess = false;
      return; // Stop further execution
    }


    // Validate message length
    if (!isMessageValid(message)) {
      responseMessage = 'message too short';
      isSuccess = false;
      return; // Stop further execution
    }


    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, message })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      responseMessage = data.body.message; // Assuming the message is inside data.message
      isSuccess = true;
    } catch (error) {
      console.error("Error in form submission:", error);
      responseMessage = "Error in form submission";
      isSuccess = false;
    }
  }

  // Auto-hide toast with fade-out effect
  $: if (isSuccess || responseMessage) {
    toastOpacity = 1; // Ensure toast is fully visible when shown

    setTimeout(() => {
      toastOpacity = 0; // Start fade-out

      setTimeout(() => {
        isSuccess = false;
        responseMessage = '';
      }, 1000); // Wait for fade-out to complete before hiding
    }, 4000); // Start fade-out 500ms before hiding toast
  }
</script>



<div class="flex flex-col items-center justify-center ">
  <div class="flex flex-col mt-32 text-left w-4/5">  
    <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">Get in touch! </h1>
    <span class="font-incon text-white text-left text-sm mb-4">Email us at info@rsmc.tech or contact us here:</span>
  </div>

  <div class="flex flex-col items-center justify-center w-4/5 lg:w-3/5 mt-2 text-left">
    <div class="w-3/4 lg:w-3/5 mb-10 mt-8">

    <h2 class="text-white font-incon text-2xl tracking-widest uppercase mt-0 mb-2 antialiased">//  CONTACT FORM</h2>

    <form on:submit={handleSubmit} class="mt-16 mb-10">
    <div class="grid gap-6 space-y-1 grid-flow-row grid-cols-1">
      <div class="relative z-0">
        <input bind:value={name} type="text" name="name" class="peer block w-auto appearance-none border-0 border-b border-gray-100 bg-transparent py-2.5 px-0 text-sm text-white focus:border-white focus:outline-none focus:ring-0" placeholder=" " />
        <label class="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm md:text-lg text-gray-100 font-anon duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-white peer-focus:dark:text-white">Name/nym</label>
      </div>
      <div class="relative z-0">
        <input bind:value={email} type="text" name="email" class="peer block w-auto appearance-none border-0 border-b border-gray-100 bg-transparent py-2.5 px-0 text-sm text-white focus:border-white focus:outline-none focus:ring-0" placeholder=" " />
        <label class="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm md:text-lg text-gray-100 font-anon duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-white peer-focus:dark:text-white">Email</label>
      </div>
      <div class="relative z-0 ">
        <textarea bind:value={message} name="message" rows="5" class="peer block w-full appearance-none border-0 border-b border-gray-100 bg-transparent py-2.5 px-0 text-sm text-white focus:border-white focus:outline-none focus:ring-0" placeholder=" "></textarea>
        <label class="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm md:text-lg text-gray-100 font-anon duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-white peer-focus:dark:text-white">Your message</label>
      </div>
    </div>
    <button type="submit" class="link mt-5 rounded-none bg-black px-2 py-2 text-white md:text-xl font-incon hover:no-underline">Send message</button>
  </form>
</div>
  <!-- Toast component for success message -->
  {#if isSuccess}
  <div class="toast toast-end transition-opacity"  style="opacity: {toastOpacity}">
    <div class="alert rounded-none bg-white border-black border-2 flex">
      <div class="h-4 md:h-6 w-2 bg-green-500"></div>
      <span class="font-incon text-black text-sm md:text-base">{responseMessage || 'message sent!'}</span>
    </div>
  </div>
  {/if}
  <!-- Toast component for error message -->
  {#if responseMessage && !isSuccess}
  <div class="toast toast-end transition-opacity opacity-[{toastOpacity}]">
    <div class="alert rounded-none bg-white border-black border-2 flex">
      <div class="h-4 md:h-6 w-2 bg-red-500"></div>
      <span class="font-incon text-black text-sm md:text-base">{responseMessage || 'Message error!'}</span>
    </div>
  </div>
  {/if}
  </div>
</div>
