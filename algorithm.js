/**
 * @template {E}
 * @param {[E]} arr 
 * @param {E} val 
 * @param {(E, E)=>number} compare 
 */
function binarySearchFloor(arr, val, compare=(a, b)=>a-b) {
    let left = 0, right = arr.length-1;
    while (left <= right) {
        let m = Math.floor((left+right)/2);
        let v = compare(val, arr[m]);
        if (v>0) {
            left = m+1;
        } else if (v<0) {
            right = m-1;
        } else {
            return m;
        }
    }
    return right;
}

/**
 * @template {E}
 * @param {[E]} arr 
 * @param {E} val 
 * @param {(E, E)=>number} compare 
 */
function binarySearchCeil(arr, val, compare=(a, b)=>a-b) {
    let left = 0, right = arr.length-1;
    while (left <= right) {
        let m = Math.floor((left+right)/2);
        let v = compare(val, arr[m]);
        if (v>0) {
            left = m+1;
        } else if (v<0) {
            right = m-1;
        } else {
            return m;
        }
    }
    return left;
}