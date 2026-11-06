# Wrong-address acceptance

Real command: `npm run collect -- --name "Hop Lee" --address "21 Mott St, New York, NY 10013" --platforms yelp`.

Hop Lee's observed address is 16 Mott St; 21 Mott St belongs to similarly named Hop Kee. References: https://www.tripadvisor.com/Restaurant_Review-g60763-d1063572-Reviews-Hop_Lee-New_York_City_New_York.html and https://onepagerapp.com/hopkee .

The real collector exited 2 (no found listing, expected for this negative test). Its original JSON is copied unchanged. Assertions passed: found:false, matched:false, and all merchant fields null. Google identity rejection prevented scraping the wrong Yelp merchant. This completes the wrong-match example only, not the five successful Yelp samples or the three independent Yelp page checks.
