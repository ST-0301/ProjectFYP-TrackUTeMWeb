<script setup>
import { computed } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";

const store = useStore();
const route = useRoute();
const isNavFixed = computed(() => store.state.isNavFixed);
const breadcrumbs = computed(() => {
  const items = [{ name: "Pages", path: "#" }];
  const pathArray = route.path.split("/").filter(p => p);

  pathArray.forEach((part, index) => {
    const path = `/${pathArray.slice(0, index + 1).join("/")}`;
    const name = part.charAt(0).toUpperCase() + part.slice(1);

    // Custom handling for schedule route
    if (route.name === "RouteSchedule") {
      if (index === 1) {
        items.push({ name: "Routes", path: "/routes" });
        items.push({
          name: route.query.name || route.params.id,
          path: ``
        });
      }
      if (index === 2) {
        items.push({ name: "Schedule", path: "" });
      }
      return;
    }

    items.push({
      name: name,
      path: path
    });
  });

  return items;
});
</script>

<template>
  <nav aria-label="breadcrumb">
    <ol class="px-0 pt-1 pb-0 mb-0 bg-transparent breadcrumb"
      :class="`me-sm-6 ${isNavFixed ? 'text-dark' : 'text-white'}`">
      <li v-for="(item, index) in breadcrumbs" :key="index" class="text-sm breadcrumb-item"
        :class="index === breadcrumbs.length - 1 ? 'active' : ''">
        <a v-if="item.path && index !== breadcrumbs.length - 1" :class="isNavFixed ? 'text-dark' : 'text-white'"
          class="opacity-8" :href="item.path">
          {{ item.name }}
        </a>
        <span v-else :class="isNavFixed ? 'text-dark' : 'text-white'">
          {{ item.name }}
        </span>
      </li>
    </ol>
    <h6 class="mb-0 font-weight-bolder" :class="isNavFixed ? 'text-dark' : 'text-white'">
      {{ breadcrumbs[breadcrumbs.length - 1]?.name }}
    </h6>
  </nav>
</template>