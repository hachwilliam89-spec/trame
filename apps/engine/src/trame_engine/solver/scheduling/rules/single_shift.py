"""UN_SEUL_SHIFT : un salarié ne tient jamais deux shifts qui se chevauchent."""

from trame_engine.solver.scheduling.rules.base import PairwiseRule
from trame_engine.solver.scheduling.week import Shift


class SingleShift(PairwiseRule):
    rule_id = "UN_SEUL_SHIFT"

    def conflicts(self, earlier: Shift, later: Shift) -> bool:
        return earlier.overlaps(later)
