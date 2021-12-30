//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;

library DateTimeLibrary {
    uint256 constant SECONDS_PER_DAY = 24 * 60 * 60;
    int256 constant OFFSET19700101 = 2440588;

    /**
     * @dev Calculate year/month/day from the number of days since 1970/01/01 using
     *      the date conversion algorithm from http://aa.usno.navy.mil/faq/docs/JD_Formula.php
     *      and adding the offset 2440588 so that 1970/01/01 is day 0
     * @param _timestamp timestamp to get date from
     */
    function timestampToDate(uint256 _timestamp)
        internal
        pure
        returns (
            uint256 year,
            uint256 month,
            uint256 day
        )
    {
        int256 _days = int256(_timestamp / SECONDS_PER_DAY);

        int256 L = _days + 68569 + OFFSET19700101;
        int256 N = (4 * L) / 146097;
        L = L - (146097 * N + 3) / 4;
        int256 _year = (4000 * (L + 1)) / 1461001;
        L = L - (1461 * _year) / 4 + 31;
        int256 _month = (80 * L) / 2447;
        int256 _day = L - (2447 * _month) / 80;
        L = _month / 11;
        _month = _month + 2 - 12 * L;
        _year = 100 * (N - 49) + _year + L;

        year = uint256(_year);
        month = uint256(_month);
        day = uint256(_day);
    }
}
