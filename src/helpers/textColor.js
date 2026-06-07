  const textColor = (total) => {
    if (total < 0) return 'text-red'
    if (total > 0) return 'text-green'
    return 'text-gray'
  }

  export default textColor