from dataclasses import dataclass
from datetime import timedelta

from market_data.interface import Candle


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: list[str]


class CandleValidator:

    def validate(
        self,
        candles: list[Candle],
        timeframe_minutes: int,
    ) -> ValidationResult:

        errors: list[str] = []

        if not candles:
            return ValidationResult(
                valid=False,
                errors=["No candles supplied"],
            )

        previous = None

        for index, candle in enumerate(candles):

            if candle.open <= 0:
                errors.append(f"Candle {index}: invalid open")

            if candle.high <= 0:
                errors.append(f"Candle {index}: invalid high")

            if candle.low <= 0:
                errors.append(f"Candle {index}: invalid low")

            if candle.close <= 0:
                errors.append(f"Candle {index}: invalid close")

            if candle.volume < 0:
                errors.append(f"Candle {index}: negative volume")

            if candle.high < max(candle.open, candle.close):
                errors.append(
                    f"Candle {index}: high below open/close"
                )

            if candle.low > min(candle.open, candle.close):
                errors.append(
                    f"Candle {index}: low above open/close"
                )

            if previous is not None:

                if candle.timestamp <= previous.timestamp:
                    errors.append(
                        f"Candle {index}: timestamps not increasing"
                    )

                expected = previous.timestamp + timedelta(
                    minutes=timeframe_minutes
                )

                if candle.timestamp != expected:
                    errors.append(
                        f"Candle {index}: gap detected between "
                        f"{previous.timestamp} and "
                        f"{candle.timestamp}"
                    )

            previous = candle

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
        )
