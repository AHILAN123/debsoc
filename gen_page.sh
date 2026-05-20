#!/bin/bash
# Usage: gen_page.sh filename.html "Page Title" "active_nav_label" "PAGE_CONTENT_HERE"
FILE=$1
TITLE=$2
ACTIVE=$3
CONTENT=$4

NAV_FOOTER=$(cat << NAVEND
<!doctype html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${TITLE} — Debating Society IIEST Shibpur</title>
  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <link rel="stylesheet" href="style.css">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">
</head>
<body class="h-full font-body overflow-auto">
<div class="w-full h-full pattern-bg">

  <nav class="w-full px-6 py-2 animate-fade-in sticky top-0 z-50" style="background: linear-gradient(135deg, #800020 0%, #5c0017 100%);">
    <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between">
      <div class="flex items-center gap-4">
        <img src="debsoclogo.jpeg" alt="DEBSOC Logo" class="h-12 w-auto object-contain">
        <div class="font-display leading-tight" style="color:#FAF7F2; letter-spacing:1px;">
          <div class="text-lg font-semibold">THE DEBATING SOCIETY OF</div>
          <div class="text-xl font-bold">IIEST-SHIBPUR</div>
        </div>
      </div>
      <div class="hidden md:flex items-center gap-6">
        <a href="homepage.html" class="nav-btn">Home</a>
        <button onclick="handleAboutClick()" class="nav-btn">About Us</button>
        <div class="relative group">
          <button class="nav-btn flex items-center gap-1">Events <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>
          <div class="absolute left-0 mt-1 w-40 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all" style="background-color:#FAF7F2;">
            <a href="becon.html"  class="block px-4 py-2 text-sm hover:opacity-70" style="color:#800020;">BECON #1.0</a>
            <a href="events.html" class="block px-4 py-2 text-sm hover:opacity-70" style="color:#800020;">MAIN EVENTS</a>
          </div>
        </div>
        <a href="gallery.html"     class="nav-btn">Gallery</a>
        <a href="tribunal.html"    class="nav-btn">Tribunal</a>
        <a href="teampage.html"    class="nav-btn">Team</a>
        <a href="contactpage.html" class="px-5 py-2 rounded-full text-sm font-semibold transition hover:scale-105" style="background:#DAA520; color:#800020;">Contact</a>
      </div>
      <button id="hamburger-btn" onclick="toggleMobileMenu()" class="md:hidden" style="color:#FAF7F2;">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </div>
    <div id="mobile-menu" class="md:hidden hidden flex-col pb-4 pt-2 gap-1">
      <a href="homepage.html"    class="px-4 py-3 text-sm rounded-lg hover:opacity-80 block" style="color:#FAF7F2;">Home</a>
      <button onclick="handleAboutClick(); toggleMobileMenu()" class="w-full text-left px-4 py-3 text-sm rounded-lg hover:opacity-80" style="color:#FAF7F2;">About Us</button>
      <a href="events.html"      class="px-4 py-3 text-sm rounded-lg hover:opacity-80 block" style="color:#FAF7F2;">Main Events</a>
      <a href="becon.html"       class="px-4 py-3 text-sm rounded-lg hover:opacity-80 block" style="color:#FAF7F2;">Becon #1.0</a>
      <a href="gallery.html"     class="px-4 py-3 text-sm rounded-lg hover:opacity-80 block" style="color:#FAF7F2;">Gallery</a>
      <a href="tribunal.html"    class="px-4 py-3 text-sm rounded-lg hover:opacity-80 block" style="color:#FAF7F2;">Tribunal</a>
      <a href="teampage.html"    class="px-4 py-3 text-sm rounded-lg hover:opacity-80 block" style="color:#FAF7F2;">Team</a>
      <a href="contactpage.html" class="block px-4 py-3 text-sm mt-2 rounded-full text-center" style="background:#DAA520; color:#800020; margin:0 1rem;">Contact</a>
    </div>
  </nav>

NAVEND
)
echo "$NAV_FOOTER" > $FILE
echo "File started: $FILE"
