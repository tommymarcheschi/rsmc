<script>
  import main from "$lib/images/auction/IMG_MAIN.jpeg";
  import detail from "$lib/images/auction/IMG_0616.jpeg";
  import detailtwo from "$lib/images/auction/IMG_0617.jpeg";
  import detailthree from "$lib/images/auction/IMG_0618.jpeg";
  import detailfour from "$lib/images/auction/IMG_0619.jpeg";
  import detailfive from "$lib/images/auction/IMG_0620.jpeg";
  import detailsix from "$lib/images/auction/IMG_0621.jpeg";


  let selectedImage = 1;
  let scrollAmount = 0;
  const images = [
    { id: 1, src: "/auction/IMG_MAIN.jpeg", alt: 'Description 1' },
    { id: 2, src: "/auction/IMG_MAIN2.jpeg", alt: 'Description 2' },
    { id: 3, src: "/auction/IMG_0616.jpeg", alt: 'Description 2' },
    { id: 4, src: "/auction/IMG_0617.jpeg", alt: 'Description 3' },
    { id: 5, src: "/auction/IMG_0618.jpeg", alt: 'Description 4' },
    { id: 6, src: "/auction/IMG_0619.jpeg", alt: 'Description 3' },
    { id: 7, src: "/auction/IMG_0620.jpeg", alt: 'Description 4' },
    { id: 8, src: "/auction/IMG_0621.jpeg", alt: 'Description 4' },

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

</script>



<div class="md:flex-1 px-4 md:sticky top-20">
  <div class="h-auto rounded-none bg-black m-0">
    {#each images as image (image.id)}
      {#if image.id === selectedImage}
       <img src={image.src} alt={image.alt} class="h-fit w-full object-contain rounded-none mb-0 cursor-pointer" on:click={toggleLightbox} />

      {/if}
    {/each}
  </div>

  {#if showLightbox}
<div class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
  <div class="relative">
    <img src={images[selectedImage - 1].src} alt={images[selectedImage - 1].alt} class="max-w-full max-h-[80vh]">
    <button on:click={toggleLightbox} class="absolute top-2 right-2 text-white text-2xl">&times;</button>
  </div>
</div>
{/if}

  <div class="relative mt-2 md:mt-4 ">
    <button on:click={() => scrollThumbnails('left')} class="absolute top-1/2 left-0 transform -translate-y-1/2 z-10 text-white bg-black p-2 rounded-r-lg shadow-md">
    	←
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
    <button on:click={() => scrollThumbnails('right')} class="absolute top-1/2 right-0 transform -translate-y-1/2 z-10 text-white bg-black p-2 rounded-l-lg shadow-md">
    	→
    </button>
  </div> 
</div> 