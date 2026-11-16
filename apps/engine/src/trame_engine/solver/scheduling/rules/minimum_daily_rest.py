"""REPOS_QUOTIDIEN_MIN : repos minimal entre deux shifts (C. trav. art. L3131-1).

Le repos se mesure en temps écoulé, d'un instant à l'autre : une nuit de changement d'heure compte
une heure de plus ou de moins que ce que montre l'horloge (ADR-0019).
"""

from dataclasses import dataclass
from datetime import timedelta

from trame_engine.solver.scheduling.rules.base import PairwiseRule
from trame_engine.solver.scheduling.week import Shift


@dataclass(frozen=True, slots=True)
class MinimumDailyRest(PairwiseRule):
    minimum_minutes: int
    rule_id = "REPOS_QUOTIDIEN_MIN"

    def conflicts(self, earlier: Shift, later: Shift) -> bool:
        if earlier.overlaps(later):
            # Le chevauchement relève de UN_SEUL_SHIFT : chaque règle ne juge que ce qu'elle porte.
            return False
        rest = later.starts_at - earlier.ends_at
        return rest < timedelta(minutes=self.minimum_minutes)
