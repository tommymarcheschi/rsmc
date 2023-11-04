<script>
  import logowithtype from "$lib/images/RSMC-logo-white-type.svg";
  
  let name = '';
  let email = '';
  let message = '';
  let responseMessage = '';

  async function handleSubmit(event) {
    event.preventDefault();

    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, message })
    });

    const data = await res.json();
    responseMessage = data.message || data.error;

        if (res.status === 200) {
      toast({ 
        title: "Success", 
        description: responseMessage, 
        color: "green" 
      });
    } else {
      toast({ 
        title: "Error", 
        description: responseMessage, 
        color: "red" 
      });
    }
  
  }
</script>

<div class="toasts top-20">test</div>


<div class="flex flex-col items-center justify-center ">
  <div class="flex flex-col mt-32 text-left w-4/5">  
    <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">Contact Us</h1>
    <span class="font-incon text-white text-left text-sm mb-4">Email us at info@rsmc.tech or message us here:</span>
  </div>

  <form on:submit={handleSubmit} class="mt-16 mb-10">
    <div class="grid gap-6 sm:grid-cols-2">
      <div class="relative z-0">
        <input bind:value={name} type="text" name="name" class="peer block w-full appearance-none border-0 border-b border-gray-500 bg-transparent py-2.5 px-0 text-sm text-white focus:border-white focus:outline-none focus:ring-0" placeholder=" " />
        <label class="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-white peer-focus:dark:text-white">Your name</label>
      </div>
      <div class="relative z-0">
        <input bind:value={email} type="text" name="email" class="peer block w-full appearance-none border-0 border-b border-gray-500 bg-transparent py-2.5 px-0 text-sm text-white focus:border-white focus:outline-none focus:ring-0" placeholder=" " />
        <label class="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-white peer-focus:dark:text-white">Your email</label>
      </div>
      <div class="relative z-0 col-span-2">
        <textarea bind:value={message} name="message" rows="5" class="peer block w-full appearance-none border-0 border-b border-gray-500 bg-transparent py-2.5 px-0 text-sm text-white focus:border-white focus:outline-none focus:ring-0" placeholder=" "></textarea>
        <label class="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-white peer-focus:dark:text-white">Your message</label>
      </div>
    </div>
    <button type="submit" class="link mt-5 rounded-none bg-black px-2 py-2 text-white font-incon hover:no-underline">Send message</button>
  </form>

  {#if responseMessage}
    <p class="mt-4 text-white">{responseMessage}</p>
  {/if}
</div>

