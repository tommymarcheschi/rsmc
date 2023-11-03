<script>
  import { onMount } from 'svelte';
  // import { TARGET_DATE } from '../config'
  import { isPublishActivated } from '../../store/countdown'

  let targetDate = new Date("November 4, 2023 16:20:00 EST");
  let days, hours, minutes, seconds;

  onMount(() => {
     const interval = setInterval(() => {
       const now = new Date().getTime();
       const distance = targetDate - now;

       days = Math.floor(distance / (1000 * 60 * 60 * 24));
       hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
       minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
       seconds = Math.floor((distance % (1000 * 60)) / 1000);

       if (distance < 0) {
         clearInterval(interval);
         days = 0;
         hours = 0;
         minutes = 0;
         seconds = 0;

         isPublishActivated.set(true)
       }
     }, 1000);
    
     return () => {
       clearInterval(interval);
     };
   });
</script>

<div class="flex flex-row justify-center mb-4 text-center text-white text-base md:text-2xl md:my-4 my-2 tracking-tighter">
  

    <div>

    </div>
    <div>
      <span class="countdown mx-1 text-base md:text-2xl ">
        <span style="--value:{days}"></span>d
      </span>
      
    </div>
    <div>
      <span class="countdown mx-1 text-base md:text-2xl ">
        <span style="--value:{hours}"></span>h
      </span>
      
    </div>
    <div>
      <span class="countdown mx-1 text-base md:text-2xl ">
        <span style="--value:{minutes}"></span>m
      </span>
      
    </div>
    <div>
      <span class="countdown mx-1 text-base md:text-2xl ">
        <span style="--value:{seconds}"></span>s
      </span>
    </div>

</div>
