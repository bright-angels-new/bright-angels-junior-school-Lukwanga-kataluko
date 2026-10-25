<script>
document.addEventListener("DOMContentLoaded", async function () {
  const menuBtn = document.getElementById("menuBtn");
  const navLinks = document.getElementById("navLinks");

  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", function () {
      const isOpen = navLinks.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  try {
    const response = await fetch("/api/public", {
      cache: "no-store"
    });

    if (!response.ok) return;

    const data = await response.json();
    const content = data.content || data.settings || data;

    const welcome = document.getElementById("welcomeText");
    const about = document.getElementById("aboutText");

    if (welcome && content.welcome) {
      welcome.textContent = content.welcome;
    }

    if (about && content.about) {
      about.textContent = content.about;
    }
  } catch (error) {
    console.error("Could not load school website text:", error);
  }
});
</script>
