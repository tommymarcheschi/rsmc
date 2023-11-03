<script>
  import { browser } from '$app/environment';
  import leftArrow from '$lib/images/RSMC-leftArrow.svg?raw';
  import rightArrow from '$lib/images/RSMC-rightArrow.svg?raw';
  import xicon from '$lib/images/RSMC-XIcon.svg?raw';


  let selectedImage = 1;
  let scrollAmount = 0;
  export let images = [
    { id: 1, src: "/auction/end-fiat/main.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting' },
    { id: 2, src: "/auction/IMG_MAIN2.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 2' },
    { id: 3, src: "/auction/IMG_0616.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 3' },
    { id: 4, src: "/auction/IMG_0617.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 4' },
    { id: 5, src: "/auction/IMG_0618.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 5' },
    { id: 6, src: "/auction/IMG_0619.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 6' },
    { id: 7, src: "/auction/IMG_0620.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 7' },
    { id: 8, src: "/auction/IMG_0621.jpeg", alt: 'Tommy Marcheschi: END FIAT! painting 8' },

  ];


  function scrollThumbnails(direction) {
    const container = document.querySelector('.thumbnails-container');
    const scrollValue = 100; // Adjust this value based on your needs
    if (direction === 'left') {
      container.scrollLeft -= scrollValue;
    } else {
      container.scrollLeft += scrollValue;
    }
  }

  let showLightbox = false;

  function toggleLightbox() {
  	showLightbox = !showLightbox;
  }

  function closeLightbox(event) {
    if (event.target.classList.contains('lightbox-background') || event.target.classList.contains('close-button')) {
      showLightbox = false;
    }
  }

  function selectPreviousImage() {
    if (selectedImage > 1) {
      selectedImage--;
    } else {
      selectedImage = images.length; // loop back to the last image
    }
  }

  function selectNextImage() {
    if (selectedImage < images.length) {
      selectedImage++;
    } else {
      selectedImage = 1; // loop back to the first image
    }
  }

  // Function to handle keydown events
  function handleKeydown(event) {
    if (showLightbox) {
      switch (event.key) {
        case 'ArrowLeft':
          selectPreviousImage();
          break;
        case 'ArrowRight':
          selectNextImage();
          break;
        case 'Escape':
          toggleLightbox();
          break;
      }
    }
  }

  // Add event listener when component mounts and remove when it unmounts
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    if (browser) {
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>



<div class="md:flex-1 px-4 md:sticky top-20">
  <div class="h-auto rounded-none bg-black m-0">
    {#each images as image (image.id)}
      {#if image.id === selectedImage}
       <img src={image.src} alt={image.alt} class="h-auto w-full object-contain rounded-none mb-0 cursor-pointer" on:click={toggleLightbox} />

      {/if}
    {/each}
  </div>

  {#if showLightbox}
  <div class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 backdrop-blur-md lightbox-background" on:click={closeLightbox}>
  	<div class="relative">
  		<button
  class="absolute -left-[5px] md:-left-[35px] top-1/2 transform -translate-y-1/2"
  on:click|stopPropagation={selectPreviousImage}
  aria-label="Previous image"
  role="button"
  tabindex="0">
  <div class="w-8 h-8 text-white">{@html leftArrow}</div>
</button>
  		<img src={images[selectedImage - 1].src} alt={images[selectedImage - 1].alt} class="w-10/12 md:w-auto max-h-[80vh] object-contain mx-auto ">
  		<button
  class="absolute -right-[5px] md:-right-[35px] top-1/2 transform -translate-y-1/2"
  on:click|stopPropagation={selectNextImage}
  aria-label="Next image"
  role="button"
  tabindex="0">
  <div class="w-8 h-8 text-white">{@html rightArrow}</div>
</button>
  		<button
  on:click|stopPropagation={toggleLightbox}
  class="absolute -top-[50px] md:top-2 right-0 md:-right-[50px] text-white text-2xl close-button"
  aria-label="Close lightbox"
  role="button"
  tabindex="0">
  <div class="w-8 h-8">{@html xicon}</div>
</button>
  	</div>
  </div>
  {/if}

  <div class="relative mt-2 md:mt-4 ">
    <button on:click={() => scrollThumbnails('left')} class="absolute top-1/2 left-0 transform -translate-y-1/2 z-10 text-white bg-black  p-1 pl-0 rounded-r-lg shadow-md">
    	  <div class="w-4 md:w-6 h-4 md:h-6 text-white object-contain">{@html leftArrow}</div>
    </button>
    <div class="thumbnails-container overflow-x-auto whitespace-nowrap w-full max-w-[100%]">
      {#each images as image (image.id)}
        <div class="inline-block px-2 ">
          <button on:click={() => selectedImage = image.id} class="focus:outline w-16 h-16 md:w-20 md:h-20 bg-black flex items-center justify-center">
            <img src={image.src} alt={image.alt} class="h-full w-full object-cover" />
          </button>
        </div>
      {/each}
    </div>
    <button on:click={() => scrollThumbnails('right')} class="absolute top-1/2 right-0 transform -translate-y-1/2 z-10 text-white bg-black pr-0 p-1 rounded-l-lg shadow-md">
    	<div class="w-4 md:w-6 h-4 md:h-6 text-white object-contain">{@html rightArrow}</div>
    </button>
  </div> 
</div> 