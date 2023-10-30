

<script>
  import logo from "$lib/images/RSMC-logo-NEW.svg";

  let selectedImage = 1;
  let scrollAmount = 0;
  const images = [
    { id: 1, src: '/RsmcFavicon-192x192.png', alt: 'Description 1' },
    { id: 2, src: logo, alt: 'Description 2' },
    { id: 3, src: '/RsmcFavicon-192x192.png', alt: 'Description 3' },
    { id: 4, src: '/RsmcFavicon-192x192.png', alt: 'Description 4' },
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
</script>

<div class="md:flex-1 px-4">
  <div class="h-64 md:h-80 rounded-lg bg-black mb-4">
    {#each images as image (image.id)}
      {#if image.id === selectedImage}
        <img src={image.src} alt={image.alt} class="h-64 md:h-80 w-auto rounded-lg mb-4" />
      {/if}
    {/each}
  </div>

  <div class="relative">
    <button on:click={() => scrollThumbnails('left')} class="absolute top-1/2 left-0 transform -translate-y-1/2 z-10 text-white p-2 rounded-r-lg shadow-md">
      ←
    </button>
    <div class="thumbnails-container overflow-x-auto whitespace-nowrap">
      {#each images as image (image.id)}
        <div class="inline-block px-2">
          <button on:click={() => selectedImage = image.id} class="focus:outline w-24 h-24 md:w-32 md:h-32 bg-black flex items-center justify-center">
            <img src={image.src} alt={image.alt} class="h-full w-full object-cover" />
          </button>
        </div>
      {/each}
    </div>
    <button on:click={() => scrollThumbnails('right')} class="absolute top-1/2 right-0 transform -translate-y-1/2 z-10 text-white p-2 rounded-l-lg shadow-md">
      →
    </button>
  </div>
</div>
