<script>
  import typelogo from "$lib/images/RSMC-logo-text.svg";
  import { blockHeight, bitcoinPrice } from "../../store/bitcoin";
  // import { Bars2 as MenuIcon, XMark as XIcon } from '@steeze-ui/heroicons';
  // import { Icon } from '@steeze-ui/svelte-icon';
  import xicon from '$lib/images/RSMC-XIcon.svg?raw';
  import menuicon from '$lib/images/RSMC-MenuIcon.svg?raw';


  let isOpen = false;

  function toggleMenu() {
    isOpen = !isOpen;
  }

  function closeMenu() {
    isOpen = false;
  }

  function handleDropdownKeydown(event) {
    if (event.key === 'Enter') {
      toggleMenu();
    }
  }

  function handleOutsideClick(event) {
    if (!event.target.closest('.dropdown') && !event.target.closest('button')) {
      closeMenu();
    }
  }

  import { onMount } from 'svelte';
  onMount(() => {
    document.addEventListener('click', handleOutsideClick);
    return () => {
        document.removeEventListener('click', handleOutsideClick);
    };
  });
</script>

<div class="navbar flex bg-black fixed top-0 justify-between items-center z-40 bottom-auto w-full p-2">
  <div class="flex items-center space-x-4">
    <a href="/" class="link"><img src="{typelogo}" alt="logotype" class="w-20 md:ml-2" /></a>
    <div class="flex items-center space-x-2 md:space-x-4">
      <h2 class="font-bahiana text-xl sm:text-2xl md:text-3xl text-orange-500 whitespace-nowrap">Block #{ $blockHeight || 'Loading...' }</h2>
      <h2 class="font-bahiana text-xl sm:text-2xl md:text-3xl text-green-600 whitespace-nowrap">1 BTC= ${ $bitcoinPrice ? `${$bitcoinPrice.toFixed(0)}` : 'Loading...' }</h2>
    </div>
  </div>

  <div class="flex items-center space-x-4">
    <!-- Desktop Menu (Visible on screens larger than 768px) -->
    <ul class="menu-horizontal font-rocks text-white text-xl rounded-none tracking-widest m-2 hidden md:flex">
      <li><a href="/about" class="hover:text-orange-400 mx-4 px-1">About</a></li>
      <li><a href="/contact" class="hover:text-orange-400 mx-4 px-1">Contact</a></li>
      <li><a href="/donate" class="hover:text-orange-400 mx-4 px-1">Donate</a></li>
      <li><a href="/store" class="hover:text-orange-400 mx-4 px-1">Store</a></li>
      <li><a href="/auctions" class="hover:text-orange-400 mx-4 px-1 bg-white text-black">Auction</a></li>

    </ul>

    <!-- Mobile Dropdown Menu using daisyUI -->
    <div tabindex="-1" class="dropdown md:hidden">
      <button class="text-white cursor-pointer" 
              on:click|stopPropagation={toggleMenu} 
              on:keydown={handleDropdownKeydown}>
        {#if isOpen}
          <div class="w-6 swap-on">{@html xicon}</div>
        {:else}
          <div class="w-6 swap-on">{@html menuicon}</div>
        {/if}
      </button>

      {#if isOpen}
        <ul tabindex="-1" class="dropdown-content z-[50] bg-black p-4 shadow text-white rounded-none w-fit text-right right-0" 
            on:click|stopPropagation >
          <li><a href="/about" class="hover:text-orange-400 block py-2 px-4 font-rocks text-xl text-right">About</a></li>
          <li><a href="/contact" class="hover:text-orange-400 block py-2 px-4 font-rocks text-xl text-right">Contact</a></li>
          <li><a href="/donate" class="hover:text-orange-400 block py-2 px-4 font-rocks text-xl text-right">Donate</a></li>
          <li><a href="/store" class="hover:text-orange-400 block py-2 px-4 font-rocks text-xl text-right">Store</a></li>
          <li><a href="/auctions" class="hover:text-orange-400 block py-2 px-4 font-rocks text-xl text-right bg-white text-black">Auction</a></li>

        </ul>
      {/if}
    </div>
  </div>
</div>
