<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  value: {
    type: String,
    default: ""
  },
  id: {
    type: String,
    default: ""
  },
  name: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(['update:modelValue']);

const isChecked = computed(() => {
  return props.modelValue.includes(props.value);
});

const handleChange = (e) => {
  const newValue = [...props.modelValue];
  if (e.target.checked) {
    newValue.push(props.value);
  } else {
    const index = newValue.indexOf(props.value);
    if (index > -1) {
      newValue.splice(index, 1);
    }
  }
  emit('update:modelValue', newValue);
};
</script>

<template>
  <div class="form-check">
    <input :id="id" class="form-check-input" type="checkbox" :name="name" :checked="isChecked" @change="handleChange" />
    <label :for="id" class="custom-control-label" :class="$attrs.class">
      <slot />
    </label>
  </div>
</template>