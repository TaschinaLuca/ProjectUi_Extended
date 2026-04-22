import { motion } from 'framer-motion';

export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}       // Starts slightly faded and pushed down
      animate={{ opacity: 1, y: 0 }}        // Slides up and fades in
      exit={{ opacity: 0, y: -15 }}         // Slides up and fades out when leaving
      transition={{ duration: 0.3, ease: 'easeOut' }} // Silky smooth timing
    >
      {children}
    </motion.div>
  );
}