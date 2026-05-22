class OccupancyStateMachine:
    """
    A temporal smoothing state machine for tracking room occupancy status.
    Prevents rapid state changes (flickering) due to momentary detection noise.
    """
    def __init__(self, positive_threshold: int = 3, negative_threshold: int = 10):
        """
        Initializes the state machine.
        
        Args:
            positive_threshold: Number of consecutive positive samples (>0 people)
                                required to mark the room as occupied.
            negative_threshold: Number of consecutive negative samples (0 people)
                                required to mark the room as available.
        """
        self.positive_threshold = positive_threshold
        self.negative_threshold = negative_threshold
        
        # Initial state is AVAILABLE (not occupied)
        self.is_occupied = False
        
        self.consecutive_positive = 0
        self.consecutive_negative = 0

    def update(self, person_count: int) -> tuple[bool, bool]:
        """
        Updates the state machine with the latest person count sample.
        
        Args:
            person_count: The number of persons detected in the latest frame.
            
        Returns:
            A tuple of (state_changed: bool, is_occupied: bool).
        """
        state_changed = False
        
        if person_count > 0:
            self.consecutive_positive += 1
            self.consecutive_negative = 0
            
            # Transition to OCCUPIED if threshold is met
            if not self.is_occupied and self.consecutive_positive >= self.positive_threshold:
                self.is_occupied = True
                state_changed = True
                print(f"[StateMachine] Transitioned to OCCUPIED (consecutive positive samples: {self.consecutive_positive})")
        else:
            self.consecutive_negative += 1
            self.consecutive_positive = 0
            
            # Transition to AVAILABLE if threshold is met
            if self.is_occupied and self.consecutive_negative >= self.negative_threshold:
                self.is_occupied = False
                state_changed = True
                print(f"[StateMachine] Transitioned to AVAILABLE (consecutive negative samples: {self.consecutive_negative})")
                
        return state_changed, self.is_occupied

    def reset(self):
        """Resets the state machine counters and state."""
        self.is_occupied = False
        self.consecutive_positive = 0
        self.consecutive_negative = 0
